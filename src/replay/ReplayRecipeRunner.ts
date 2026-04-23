import type { BattlefieldSnapshotRegistryLike } from '../battlefield/lineage.js';
import { buildBattlefieldLineageContribution, readBattlefieldLineageSnapshot, uniqueStrings } from '../battlefield/lineage.js';
import { AppError } from '../core/errors.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { HookManager } from '../hook/HookManager.js';
import type { NetworkCollector } from '../network/NetworkCollector.js';
import type { RequestInitiatorTracker } from '../network/RequestInitiatorTracker.js';
import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import type { CodeCollector } from '../collector/CodeCollector.js';
import type { CaptureReportBuilder } from '../report/CaptureReportBuilder.js';
import type { SignatureScenarioAnalyzer } from '../scenario/SignatureScenarioAnalyzer.js';
import type { TaskManifestManager } from '../task/TaskManifestManager.js';
import type { CapturePresetRegistry } from './CapturePresetRegistry.js';
import type { ReplayActionRunner } from './ReplayActionRunner.js';
import type { ReplayEvidenceWindow } from './ReplayEvidenceWindow.js';
import type { CapturePreset, ReplayAction, ReplayRecipeResult, ReplayStepResult } from './types.js';

interface ReplayRecipeRunnerDeps {
  browserSession: BrowserSessionManager;
  capturePresetRegistry: CapturePresetRegistry;
  captureReportBuilder: CaptureReportBuilder;
  codeCollector: CodeCollector;
  evidenceStore: EvidenceStore;
  hookManager: HookManager;
  networkCollector: NetworkCollector;
  replayActionRunner: ReplayActionRunner;
  replayEvidenceWindow: ReplayEvidenceWindow;
  requestInitiatorTracker: RequestInitiatorTracker;
  signatureScenarioAnalyzer: SignatureScenarioAnalyzer;
  taskManifestManager: TaskManifestManager;
  battlefieldIntegrationRegistry?: BattlefieldSnapshotRegistryLike;
}

const DEFAULT_CAPTURE_WINDOW_MS = 4_000;

export class ReplayRecipeRunner {
  private lastReplayRecipeResult: ReplayRecipeResult | null = null;

  constructor(private readonly deps: ReplayRecipeRunnerDeps) {}

  getLastReplayRecipeResult(): ReplayRecipeResult | null {
    return this.lastReplayRecipeResult;
  }

  async run(options: {
    presetId: string;
    actions: ReplayAction[];
    targetUrl?: string;
    captureWindowMs?: number;
    topN?: number;
    taskId?: string;
    writeEvidence?: boolean;
  }): Promise<ReplayRecipeResult> {
    const preset = this.deps.capturePresetRegistry.get(options.presetId);
    if (!preset) {
      throw new AppError('CAPTURE_PRESET_NOT_FOUND', `Capture preset not found: ${options.presetId}`, {
        presetId: options.presetId
      });
    }

    const notes: string[] = [];
    await this.ensureHooks(preset, notes);
    await this.ensureCaptureReady(preset, options.topN, notes);

    const captureWindowMs = options.captureWindowMs ?? preset.defaultCaptureWindowMs ?? DEFAULT_CAPTURE_WINDOW_MS;
    const evidence = await this.deps.replayEvidenceWindow.captureAround(
      async () => this.runActions(options.actions),
      { captureWindowMs }
    );
    notes.push(...evidence.notes);

    const scenarioResult = await this.deps.signatureScenarioAnalyzer.analyze({
      includeDynamic: preset.collectHints?.includeDynamic,
      scenario: preset.scenario ?? 'api-signature',
      targetUrl: options.targetUrl,
      topN: options.topN ?? preset.collectHints?.topN
    });
    const battlefieldSnapshot = await readBattlefieldLineageSnapshot(this.deps.battlefieldIntegrationRegistry, {
      taskId: options.taskId
    });
    const battlefield = buildBattlefieldLineageContribution(battlefieldSnapshot, 'capture replay');

    const result: ReplayRecipeResult = {
      evidenceWritten: false,
      executedSteps: evidence.executedSteps,
      hookSummary: evidence.hookSummary,
      nextActions: uniqueStrings([
        ...this.buildNextActions({
          observedRequests: evidence.observedRequests.length,
          scenarioActions: scenarioResult.nextActions.map((action) => action.step),
          suspiciousRequests: scenarioResult.suspiciousRequests.length
        }),
        ...battlefield.nextActions
      ], 14),
      notes: uniqueStrings([
        ...notes,
        ...battlefield.notes,
        ...(preset.notes ?? []),
        `Capture window: ${captureWindowMs}ms.`,
        evidence.observedRequests.length > 0
          ? `Observed ${evidence.observedRequests.length} request(s) during replay window.`
          : 'No new request was observed during replay window.'
      ], 30),
      observedRequests: evidence.observedRequests,
      preset,
      scenarioResult,
      stopIf: uniqueStrings([
        ...scenarioResult.stopIf,
        ...battlefield.stopIf,
        'Stop replay expansion once the same target request and helper boundary are reproducible across two runs.',
        'Stop adding actions if replay introduces unrelated requests that obscure the target chain.'
      ], 16),
      suspiciousRequests: scenarioResult.suspiciousRequests,
      task: null
    };

    if (options.taskId && options.writeEvidence) {
      result.evidenceWritten = true;
      const task = await this.writeEvidence(options.taskId, options.targetUrl, result);
      result.task = task;
      await this.deps.evidenceStore.writeSnapshot(options.taskId, 'scenario/capture/result', result);
    }

    this.lastReplayRecipeResult = result;
    return result;
  }

  private async runActions(actions: readonly ReplayAction[]): Promise<ReplayStepResult[]> {
    const results: ReplayStepResult[] = [];

    for (const action of actions) {
      const result = await this.deps.replayActionRunner.run(action);
      results.push(result);
      if (!result.ok && !action.optional) {
        break;
      }
    }

    return results;
  }

  private async ensureHooks(preset: CapturePreset, notes: string[]): Promise<void> {
    try {
      const page = await this.deps.browserSession.getSelectedPage();
      for (const type of preset.defaultHooks) {
        if (type !== 'fetch' && type !== 'xhr') {
          notes.push(`Capture preset hook ${type} is a hint only in this phase.`);
          continue;
        }

        const hookId = `capture-${preset.presetId}-${type}`;
        let hook = this.deps.hookManager.getHook(hookId);
        if (!hook) {
          hook = this.deps.hookManager.createHook({
            description: `[capture:${preset.presetId}] ${type} hook`,
            hookId,
            type
          });
        }
        await this.deps.hookManager.injectHook(hook.hookId, page, {
          currentDocument: true,
          futureDocuments: true
        });
      }
      await this.deps.networkCollector.ensureAttachedToSelectedPage();
      await this.deps.requestInitiatorTracker.ensureAttachedToSelectedPage();
    } catch (error) {
      notes.push(`Unable to ensure replay hooks/network observers: ${this.toMessage(error)}`);
    }
  }

  private async ensureCaptureReady(preset: CapturePreset, topN: number | undefined, notes: string[]): Promise<void> {
    const hasCode = this.deps.codeCollector.getTopPriorityFiles(1).files.length > 0;
    if (hasCode && !preset.collectHints?.includeDynamic) {
      return;
    }

    try {
      await this.deps.codeCollector.collect({
        includeDynamic: preset.collectHints?.includeDynamic,
        includeExternal: true,
        includeInline: true,
        topN: topN ?? preset.collectHints?.topN
      });
      notes.push('Capture recipe collected scripts from the selected page before replay.');
    } catch (error) {
      notes.push(`Capture recipe could not collect code before replay: ${this.toMessage(error)}`);
    }
  }

  private buildNextActions(input: {
    observedRequests: number;
    scenarioActions: readonly string[];
    suspiciousRequests: number;
  }): string[] {
    const actions: string[] = [];

    if (input.observedRequests === 0) {
      actions.push('Refine replay actions or add wait-for-request; the capture window did not observe new requests.');
    }
    if (input.suspiciousRequests > 0) {
      actions.push('Run extract_helper_boundary against the top helper or request-bound parameter from this capture.');
    } else {
      actions.push('Rerun analyze_signature_chain after a more specific targetUrl or replay action sequence.');
    }
    actions.push(...input.scenarioActions.slice(0, 6));
    return this.unique(actions).slice(0, 12);
  }

  private async writeEvidence(
    taskId: string,
    targetUrl: string | undefined,
    result: ReplayRecipeResult
  ): Promise<{ taskId: string; taskDir: string }> {
    const task = await this.deps.evidenceStore.openTask({
      goal: `capture:${result.preset.presetId}`,
      targetUrl,
      taskId
    });
    await this.deps.evidenceStore.appendLog(taskId, 'runtime-evidence', {
      executedSteps: result.executedSteps.map((step) => ({
        ok: step.ok,
        summary: step.summary,
        type: step.action.type
      })),
      hookSummary: result.hookSummary,
      kind: 'replay_capture',
      observedRequests: result.observedRequests,
      presetId: result.preset.presetId,
      suspiciousRequests: result.suspiciousRequests
    });
    await this.deps.evidenceStore.writeSnapshot(taskId, 'scenario/capture/preset', result.preset);
    await this.deps.evidenceStore.writeSnapshot(taskId, 'scenario/capture/actions', result.executedSteps);
    await this.deps.evidenceStore.writeSnapshot(taskId, 'scenario/capture/result', result);
    const report = await this.deps.captureReportBuilder.build(result, 'markdown');
    await this.deps.evidenceStore.writeSnapshot(taskId, 'scenario/capture/report-markdown', {
      markdown: report.markdown
    });
    await this.deps.taskManifestManager.ensureTask(taskId, {
      goal: `capture:${result.preset.presetId}`,
      targetUrl
    });
    await this.deps.taskManifestManager.updatePointers(taskId, {
      scenarioCapture: 'scenario/capture/result'
    });

    return {
      taskDir: task.taskDir,
      taskId: task.taskId
    };
  }

  private unique(values: readonly string[]): string[] {
    const seen = new Set<string>();
    const output: string[] = [];

    for (const value of values) {
      const normalized = value.trim();
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      output.push(normalized);
    }

    return output;
  }

  private toMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
