import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import type { HookManager } from '../hook/HookManager.js';
import type { NetworkCollector } from '../network/NetworkCollector.js';
import type { RequestInitiatorTracker } from '../network/RequestInitiatorTracker.js';
import type { ReplayRecipeRunner } from '../replay/ReplayRecipeRunner.js';
import type { RequestSinkLocator } from '../scenario/RequestSinkLocator.js';
import type { SignatureScenarioAnalyzer } from '../scenario/SignatureScenarioAnalyzer.js';
import type { DebuggerSessionManager } from './DebuggerSessionManager.js';
import type { DebuggerCorrelationHint, PausedStateSummary } from './types.js';

interface DebuggerEvidenceCorrelatorDeps {
  browserSession: BrowserSessionManager;
  debuggerSessionManager: DebuggerSessionManager;
  hookManager: HookManager;
  networkCollector: NetworkCollector;
  requestInitiatorTracker: RequestInitiatorTracker;
  signatureScenarioAnalyzer: SignatureScenarioAnalyzer;
  requestSinkLocator: RequestSinkLocator;
  replayRecipeRunner: ReplayRecipeRunner;
}

const DEFAULT_MAX_HINTS = 8;
const SINK_PATTERN = /\b(fetch|XMLHttpRequest|xhr|ajax|sendBeacon|request|axios|send)\b/i;

export class DebuggerEvidenceCorrelator {
  constructor(private readonly deps: DebuggerEvidenceCorrelatorDeps) {}

  async correlatePausedState(options: { targetUrl?: string; maxHints?: number } = {}): Promise<DebuggerCorrelationHint[]> {
    const maxHints = Math.max(1, Math.min(30, Math.floor(options.maxHints ?? DEFAULT_MAX_HINTS)));
    const state = this.deps.debuggerSessionManager.getPausedState();
    if (!state.isPaused) {
      return [];
    }

    const hints: DebuggerCorrelationHint[] = [];
    hints.push(...await this.networkHints(state, options.targetUrl));
    hints.push(...this.hookHints(state));
    hints.push(...this.scenarioHints(state, options.targetUrl));
    hints.push(...this.sinkHints(state));

    return dedupeHints(hints)
      .sort((left, right) => right.confidence - left.confidence || left.kind.localeCompare(right.kind))
      .slice(0, maxHints);
  }

  private async networkHints(state: PausedStateSummary, targetUrl: string | undefined): Promise<DebuggerCorrelationHint[]> {
    try {
      await this.deps.networkCollector.ensureAttachedToSelectedPage();
      const snapshot = await this.deps.networkCollector.listRequests({ limit: 40 });
      const frameUrl = state.topFrame?.url;
      const frameHost = hostOf(frameUrl);
      return snapshot.requests
        .filter((request) => {
          if (targetUrl && request.url.includes(targetUrl)) {
            return true;
          }
          if (frameHost && request.url.includes(frameHost)) {
            return true;
          }
          return false;
        })
        .slice(-5)
        .map((request) => ({
          confidence: targetUrl && request.url.includes(targetUrl) ? 0.78 : 0.58,
          kind: 'request' as const,
          reason: `Paused frame ${state.topFrame?.functionName ?? '(unknown)'} is near an observed ${request.method} request in the current selected page evidence.`,
          value: `${request.method} ${request.url}`
        }));
    } catch {
      return [];
    }
  }

  private hookHints(state: PausedStateSummary): DebuggerCorrelationHint[] {
    const functionName = state.topFrame?.functionName ?? '';
    const frameUrl = state.topFrame?.url ?? '';
    return this.deps.hookManager.listHooks()
      .filter((hook) => {
        const haystack = `${hook.hookId} ${hook.description} ${JSON.stringify(hook.config.params ?? {})}`;
        return containsLoose(haystack, functionName) || (frameUrl && haystack.includes(frameUrl));
      })
      .slice(0, 5)
      .map((hook) => ({
        confidence: hook.type === 'function' ? 0.7 : 0.55,
        kind: 'hook' as const,
        reason: `Registered ${hook.type} hook metadata is close to paused function/frame context; live hook record reads are avoided while paused.`,
        value: hook.hookId
      }));
  }

  private scenarioHints(state: PausedStateSummary, targetUrl: string | undefined): DebuggerCorrelationHint[] {
    const scenario = this.deps.replayRecipeRunner.getLastReplayRecipeResult()?.scenarioResult;
    if (!scenario) {
      return [];
    }

    const frameName = state.topFrame?.functionName ?? '';
    const frameUrl = state.topFrame?.url ?? '';
    const hints: DebuggerCorrelationHint[] = [];

    for (const target of scenario.priorityTargets.slice(0, 8)) {
      if (containsLoose(target.target, frameName) || containsLoose(frameName, target.target) || (frameUrl && target.target.includes(frameUrl))) {
        hints.push({
          confidence: Math.min(0.88, 0.48 + target.score / 200),
          kind: 'scenario-target',
          reason: `Paused top frame overlaps scenario priority target (${target.kind}); this can refine boundary/window/probe evidence.`,
          value: `${target.kind}: ${target.target}`
        });
      }
    }

    for (const request of scenario.suspiciousRequests.slice(0, 5)) {
      if ((targetUrl && request.url.includes(targetUrl)) || (frameUrl && sharesHost(frameUrl, request.url))) {
        hints.push({
          confidence: Math.min(0.84, 0.5 + request.score / 220),
          kind: 'scenario-target',
          reason: 'Paused frame URL is close to a top suspicious request from the latest replay scenario analysis.',
          value: `${request.method} ${request.url}`
        });
      }
    }

    return hints;
  }

  private sinkHints(state: PausedStateSummary): DebuggerCorrelationHint[] {
    return state.callFrames
      .filter((frame) => SINK_PATTERN.test(`${frame.functionName} ${frame.url ?? ''}`))
      .slice(0, 5)
      .map((frame, index) => ({
        confidence: index === 0 ? 0.76 : 0.62,
        kind: 'sink' as const,
        reason: 'Paused call stack contains a request sink-like function or script URL.',
        value: `${frame.functionName} @ ${frame.url ?? frame.scriptId ?? '(unknown script)'}:${frame.lineNumber}`
      }));
  }
}

function dedupeHints(hints: readonly DebuggerCorrelationHint[]): DebuggerCorrelationHint[] {
  const byKey = new Map<string, DebuggerCorrelationHint>();
  for (const hint of hints) {
    const key = `${hint.kind}:${hint.value}`;
    const existing = byKey.get(key);
    if (!existing || hint.confidence > existing.confidence) {
      byKey.set(key, hint);
    }
  }
  return Array.from(byKey.values());
}

function containsLoose(left: string, right: string): boolean {
  const normalizedLeft = left.trim().toLowerCase();
  const normalizedRight = right.trim().toLowerCase();
  if (!normalizedLeft || !normalizedRight || normalizedRight === '(anonymous)') {
    return false;
  }
  return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
}

function hostOf(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function sharesHost(left: string, right: string): boolean {
  const leftHost = hostOf(left);
  const rightHost = hostOf(right);
  return Boolean(leftHost && rightHost && leftHost === rightHost);
}
