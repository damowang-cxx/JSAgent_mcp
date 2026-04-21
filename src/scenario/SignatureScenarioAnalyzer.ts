import type { CryptoDetector } from '../analysis/CryptoDetector.js';
import type { StaticAnalyzer } from '../analysis/StaticAnalyzer.js';
import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import type { CodeCollector } from '../collector/CodeCollector.js';
import type { RequestChainCorrelator } from '../correlation/RequestChainCorrelator.js';
import type { CorrelationResult } from '../correlation/types.js';
import type { Deobfuscator } from '../deobfuscation/Deobfuscator.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { HookManager } from '../hook/HookManager.js';
import type { NetworkCollector } from '../network/NetworkCollector.js';
import type { RequestInitiatorTracker } from '../network/RequestInitiatorTracker.js';
import type { TaskManifestManager } from '../task/TaskManifestManager.js';
import type { AnalyzeTargetRunner } from '../workflow/AnalyzeTargetRunner.js';
import type { CryptoHelperLocator } from './CryptoHelperLocator.js';
import {
  dedupeIndicators,
  extractCandidateFunctionNames,
  indicatorsFromRequest,
  indicatorsFromText,
  indicatorsToStrings,
  requestPatternLabel,
  scoreNetworkRequest
} from './heuristics.js';
import {
  clampScore,
  dedupeBy,
  normalizeUrlPattern,
  targetMatches,
  uniqueStrings
} from './normalization.js';
import type { RequestSinkLocator } from './RequestSinkLocator.js';
import type {
  PriorityTarget,
  ScenarioAction,
  ScenarioAnalysisResult,
  ScenarioIndicator,
  ScenarioType,
  SuspiciousRequest
} from './types.js';

interface SignatureScenarioAnalyzerDeps {
  analyzeTargetRunner: AnalyzeTargetRunner;
  codeCollector: CodeCollector;
  cryptoDetector: CryptoDetector;
  cryptoHelperLocator: CryptoHelperLocator;
  deobfuscator: Deobfuscator;
  evidenceStore: EvidenceStore;
  hookManager: HookManager;
  networkCollector: NetworkCollector;
  requestChainCorrelator: RequestChainCorrelator;
  requestInitiatorTracker: RequestInitiatorTracker;
  requestSinkLocator: RequestSinkLocator;
  staticAnalyzer: StaticAnalyzer;
  taskManifestManager: TaskManifestManager;
  browserSession: BrowserSessionManager;
}

interface SignatureAnalyzeOptions {
  targetUrl?: string;
  topN?: number;
  includeDynamic?: boolean;
  correlationWindowMs?: number;
  scenario?: ScenarioType;
}

const DEFAULT_TOP_N = 8;

export class SignatureScenarioAnalyzer {
  constructor(private readonly deps: SignatureScenarioAnalyzerDeps) {}

  async analyze(options: SignatureAnalyzeOptions = {}): Promise<ScenarioAnalysisResult> {
    const scenario = options.scenario ?? 'api-signature';
    const topN = Math.max(1, options.topN ?? DEFAULT_TOP_N);
    const notes: string[] = [];

    await this.collectIfNeeded(options, notes);

    const files = this.deps.codeCollector.getTopPriorityFiles(topN).files;
    const mergedCode = files.map((file) => `/* ${file.url} */\n${file.content}`).join('\n');
    if (files.length === 0) {
      notes.push('No collected code files are available; analysis will rely on runtime/network evidence.');
    }

    const [understanding, crypto, sinkResult, helperResult, requests, hookIndicators, correlation] = await Promise.all([
      this.deps.staticAnalyzer.understand({ code: mergedCode, focus: 'all' }),
      this.deps.cryptoDetector.detect({ code: mergedCode }),
      this.deps.requestSinkLocator.locate({ targetUrl: options.targetUrl, topN }),
      this.deps.cryptoHelperLocator.locate({ topN }),
      this.readRequests(options.targetUrl, notes),
      this.readHookIndicators(notes),
      this.readCorrelation(options, notes)
    ]);

    const lastAnalyze = this.deps.analyzeTargetRunner.getLastAnalyzeTargetResult();
    const candidateFunctions = uniqueStrings([
      ...extractCandidateFunctionNames(mergedCode, 80),
      ...understanding.structure.candidateFunctions,
      ...(lastAnalyze?.understanding.structure.candidateFunctions ?? []),
      ...(lastAnalyze?.priorityTargets.filter((target) => target.type === 'function').map((target) => target.label) ?? []),
      ...helperResult.helpers.map((helper) => helper.name).filter((name) => !name.startsWith('crypto:'))
    ], 60);

    const requestSinks = uniqueStrings([
      ...sinkResult.sinks.map((sink) => sink.sink),
      ...(lastAnalyze?.requestFingerprints.map((fingerprint) => `${fingerprint.method} ${fingerprint.pattern}`) ?? [])
    ], 40);

    const indicators = this.buildIndicators({
      code: mergedCode,
      cryptoAlgorithms: crypto.algorithms.map((algorithm) => algorithm.name),
      helperResult,
      hookIndicators,
      requests,
      requestSinks
    });
    const suspiciousRequests = this.buildSuspiciousRequests({
      correlation,
      hookIndicators,
      requests,
      targetUrl: options.targetUrl
    });
    const priorityTargets = this.buildPriorityTargets({
      candidateFunctions,
      helperNames: helperResult.helpers.map((helper) => helper.name),
      indicators,
      requestSinks,
      suspiciousRequests
    });
    const nextActions = this.buildNextActions({
      candidateFunctions,
      helperNames: helperResult.helpers.map((helper) => helper.name),
      hookIndicatorCount: hookIndicators.length,
      priorityTargets,
      requestSinks,
      suspiciousRequests
    });
    const stopIf = this.buildStopConditions({
      correlation,
      filesCount: files.length,
      hookIndicatorCount: hookIndicators.length,
      suspiciousRequests
    });

    notes.push(...sinkResult.notes.map((note) => `request sink locator: ${note}`));
    notes.push(...helperResult.notes.map((note) => `crypto helper locator: ${note}`));
    if (lastAnalyze) {
      notes.push('Last analyze_target result was used as auxiliary scenario evidence.');
    }

    return {
      candidateFunctions,
      indicators,
      nextActions,
      notes: uniqueStrings(notes, 40),
      priorityTargets,
      requestSinks,
      scenario,
      stopIf,
      suspiciousRequests,
      targetUrl: options.targetUrl,
      whyTheseTargets: this.buildWhyTheseTargets(priorityTargets)
    };
  }

  private async collectIfNeeded(options: SignatureAnalyzeOptions, notes: string[]): Promise<void> {
    const current = this.deps.codeCollector.getTopPriorityFiles(1).files;
    if (current.length > 0 || !options.includeDynamic) {
      return;
    }

    try {
      await this.deps.codeCollector.collect({
        includeDynamic: true,
        includeExternal: true,
        includeInline: true
      });
      notes.push('Collected current selected page scripts because includeDynamic=true and no code cache was present.');
    } catch (error) {
      notes.push(`Dynamic collection was requested but failed: ${this.toMessage(error)}`);
    }
  }

  private async readRequests(targetUrl: string | undefined, notes: string[]) {
    try {
      const snapshot = await this.deps.networkCollector.listRequests({ limit: 300 });
      return snapshot.requests.filter((request) => targetMatches(request.url, targetUrl));
    } catch (error) {
      notes.push(`Unable to read network requests: ${this.toMessage(error)}`);
      return [];
    }
  }

  private async readHookIndicators(notes: string[]): Promise<ScenarioIndicator[]> {
    try {
      const page = await this.deps.browserSession.getSelectedPage();
      const hookData = await this.deps.hookManager.getHookData(page);
      return dedupeIndicators(
        Object.entries(hookData.records).flatMap(([hookId, records]) =>
          records.flatMap((record) =>
            indicatorsFromText(record, {
              reasonPrefix: `hook ${hookId}`
            })
          )
        )
      );
    } catch (error) {
      notes.push(`Unable to read hook indicators: ${this.toMessage(error)}`);
      return [];
    }
  }

  private async readCorrelation(options: SignatureAnalyzeOptions, notes: string[]): Promise<CorrelationResult | null> {
    try {
      const page = await this.deps.browserSession.getSelectedPage();
      return await this.deps.requestChainCorrelator.correlate(page, {
        correlationWindowMs: options.correlationWindowMs,
        maxFingerprints: options.topN,
        maxFlows: 30
      });
    } catch (error) {
      notes.push(`Unable to correlate request chain: ${this.toMessage(error)}`);
      return null;
    }
  }

  private buildIndicators(input: {
    code: string;
    cryptoAlgorithms: readonly string[];
    helperResult: Awaited<ReturnType<CryptoHelperLocator['locate']>>;
    hookIndicators: readonly ScenarioIndicator[];
    requests: Awaited<ReturnType<SignatureScenarioAnalyzer['readRequests']>>;
    requestSinks: readonly string[];
  }): ScenarioIndicator[] {
    const indicators: ScenarioIndicator[] = [];

    indicators.push(...input.requests.flatMap((request) => indicatorsFromRequest(request)));
    indicators.push(...input.hookIndicators);
    indicators.push(...indicatorsFromText(input.code, { reasonPrefix: 'top-priority code' }));
    indicators.push(...input.cryptoAlgorithms.map((algorithm) => ({
      confidence: 0.78,
      reason: 'crypto detector matched algorithm in top-priority code',
      type: 'crypto' as const,
      value: algorithm
    })));
    indicators.push(...input.requestSinks.map((sink) => ({
      confidence: 0.7,
      reason: 'request sink locator found a sink candidate',
      type: 'sink' as const,
      value: sink
    })));
    indicators.push(...input.helperResult.helpers.map((helper) => ({
      confidence: helper.confidence,
      reason: `crypto helper locator classified helper as ${helper.kind}`,
      type: 'function' as const,
      value: helper.name
    })));

    return dedupeIndicators(indicators).slice(0, 120);
  }

  private buildSuspiciousRequests(input: {
    correlation: CorrelationResult | null;
    hookIndicators: readonly ScenarioIndicator[];
    requests: Awaited<ReturnType<SignatureScenarioAnalyzer['readRequests']>>;
    targetUrl?: string;
  }): SuspiciousRequest[] {
    const fingerprintScores = new Map<string, { score: number; indicators: string[]; matchedInitiators: number }>();

    for (const fingerprint of input.correlation?.requestFingerprints ?? []) {
      for (const sampleUrl of fingerprint.sampleUrls) {
        fingerprintScores.set(normalizeUrlPattern(sampleUrl), {
          indicators: fingerprint.signatureIndicators,
          matchedInitiators: fingerprint.matchedInitiators,
          score: fingerprint.suspiciousScore
        });
      }
    }

    const requests = input.requests.map((request) => {
      const correlation = fingerprintScores.get(normalizeUrlPattern(request.url));
      const scored = scoreNetworkRequest(request, {
        correlatedIndicators: correlation?.indicators,
        fingerprintScore: correlation?.score,
        matchedInitiators: correlation?.matchedInitiators,
        targetUrl: input.targetUrl
      });
      return {
        indicators: scored.indicators,
        method: request.method.toUpperCase(),
        score: scored.score,
        url: request.url
      };
    });

    const correlatedOnly = (input.correlation?.suspiciousFlows ?? [])
      .filter((flow) => targetMatches(flow.url, input.targetUrl))
      .map((flow) => ({
        indicators: uniqueStrings(flow.signatureIndicators, 20),
        method: flow.method,
        score: clampScore(55 + flow.signatureIndicators.length * 8 + flow.matchedInitiators * 4),
        url: flow.url
      }));

    return dedupeBy([...requests, ...correlatedOnly]
      .filter((request) => request.score >= 25 || request.indicators.length > 0)
      .sort((left, right) => right.score - left.score || left.url.localeCompare(right.url)), (request) => `${request.method}:${request.url}`)
      .slice(0, 30);
  }

  private buildPriorityTargets(input: {
    candidateFunctions: readonly string[];
    helperNames: readonly string[];
    indicators: readonly ScenarioIndicator[];
    requestSinks: readonly string[];
    suspiciousRequests: readonly SuspiciousRequest[];
  }): PriorityTarget[] {
    const targets: PriorityTarget[] = [];

    for (const request of input.suspiciousRequests.slice(0, 8)) {
      targets.push({
        kind: 'request',
        reasons: [
          `request score ${request.score}`,
          request.indicators.length > 0 ? `matched indicators: ${request.indicators.join(', ')}` : '',
          /^(POST|PUT|PATCH|DELETE)$/i.test(request.method) ? `write-like method ${request.method}` : ''
        ].filter(Boolean),
        score: request.score,
        target: `${request.method} ${normalizeUrlPattern(request.url)}`
      });
    }

    for (const sink of input.requestSinks.slice(0, 8)) {
      targets.push({
        kind: 'sink',
        reasons: ['request sink is a likely final hop before network dispatch'],
        score: 68,
        target: sink
      });
    }

    for (const name of input.candidateFunctions.slice(0, 10)) {
      targets.push({
        kind: 'function',
        reasons: [
          'function name matches sign/token/auth/nonce/crypto scenario keywords',
          input.suspiciousRequests.length > 0 ? `paired with top request ${requestPatternLabelFromSuspicious(input.suspiciousRequests[0]!)}` : ''
        ].filter(Boolean),
        score: 64,
        target: name
      });
    }

    for (const helper of input.helperNames.slice(0, 8)) {
      targets.push({
        kind: 'helper',
        reasons: ['crypto helper locator marked this helper for audit'],
        score: helper.startsWith('crypto:') ? 48 : 62,
        target: helper
      });
    }

    for (const value of indicatorsToStrings(input.indicators).slice(0, 8)) {
      targets.push({
        kind: 'param',
        reasons: ['indicator appears in request/code/hook evidence'],
        score: 46,
        target: value
      });
    }

    return dedupeBy(
      targets.sort((left, right) => right.score - left.score || left.target.localeCompare(right.target)),
      (target) => `${target.kind}:${target.target}`
    ).slice(0, 25);
  }

  private buildNextActions(input: {
    candidateFunctions: readonly string[];
    helperNames: readonly string[];
    hookIndicatorCount: number;
    priorityTargets: readonly PriorityTarget[];
    requestSinks: readonly string[];
    suspiciousRequests: readonly SuspiciousRequest[];
  }): ScenarioAction[] {
    const actions: ScenarioAction[] = [];
    const topRequest = input.suspiciousRequests[0];
    const topFunction = input.candidateFunctions[0];
    const topSink = input.requestSinks[0];
    const topHelper = input.helperNames.find((name) => !name.startsWith('crypto:')) ?? input.helperNames[0];

    if (topRequest) {
      actions.push({
        purpose: 'Confirm the target-chain anchor before expanding capture.',
        step: `Prioritize ${topRequest.method} ${normalizeUrlPattern(topRequest.url)} and compare its query/body/header indicators: ${topRequest.indicators.slice(0, 6).join(', ') || 'none'}.`,
        stopIf: 'Stop broad request capture once this request is reproducible and its sink is stable.'
      });
    } else {
      actions.push({
        purpose: 'Create runtime evidence before making rebuild assumptions.',
        step: 'Inject fetch/xhr hooks, trigger the target business action once, then rerun analyze_signature_chain.',
        stopIf: 'Stop if no target request appears after the action; refine the page action or targetUrl first.'
      });
    }

    if (topSink) {
      actions.push({
        purpose: 'Locate the final hop before the request leaves the page.',
        step: `Inspect request sink ${topSink} and its nearest candidate function.`,
        stopIf: 'Stop sink expansion once the same sink appears in both hook/network and code evidence.'
      });
    }

    if (topFunction) {
      actions.push({
        purpose: 'Audit the most likely parameter builder.',
        step: `Search collected code for ${topFunction}, then inspect callers and arguments around sign/token/nonce fields.`,
        stopIf: 'Stop static expansion if the function is not on the target request path.'
      });
    }

    if (topHelper) {
      actions.push({
        purpose: 'Prepare helper-boundary extraction for rebuild or pure extraction.',
        step: `Run deobfuscate_code or focused review around helper ${topHelper}, then capture one input/output sample with a function hook if possible.`,
        stopIf: 'Stop helper extraction if no request-bound parameter consumes its output.'
      });
    }

    if (input.hookIndicatorCount === 0) {
      actions.push({
        purpose: 'Prefer hook evidence before breakpoint/debugger escalation.',
        step: 'Install fetch/xhr hooks before replaying the target action; only narrow to function hooks after a request or helper candidate is identified.',
        stopIf: 'Stop broad hooks if hook records become noisy; narrow to the top request sink or helper.'
      });
    }

    return actions;
  }

  private buildStopConditions(input: {
    correlation: CorrelationResult | null;
    filesCount: number;
    hookIndicatorCount: number;
    suspiciousRequests: readonly SuspiciousRequest[];
  }): string[] {
    const conditions = [
      'Stop broad capture once the target request, final request sink, and one parameter family are confirmed by evidence.',
      'Stop before rebuild if no collected code file contains the suspected request builder or crypto helper.',
      'Stop escalating to debugger/breakpoints while fetch/xhr hooks still provide stable request evidence.'
    ];

    if (input.suspiciousRequests.length === 0) {
      conditions.unshift('Stop scenario conclusions until a suspicious target request is observed or targetUrl is refined.');
    }
    if (input.filesCount === 0) {
      conditions.push('Stop static helper conclusions because no code cache is currently available.');
    }
    if (input.hookIndicatorCount > 80) {
      conditions.push('Stop broad hook capture because hook indicators are noisy; narrow by request URL or candidate function.');
    }
    if (input.correlation && input.correlation.suspiciousFlows.length === 0) {
      conditions.push('Stop correlation conclusions if no suspicious flow appears after the target action is replayed.');
    }

    return uniqueStrings(conditions, 12);
  }

  private buildWhyTheseTargets(targets: readonly PriorityTarget[]): string[] {
    if (targets.length === 0) {
      return ['No priority target was promoted because request, hook, and code evidence did not converge yet.'];
    }

    return targets.slice(0, 8).map((target) => `${target.kind} ${target.target}: ${target.reasons.join('; ') || `score ${target.score}`}`);
  }

  private toMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

function requestPatternLabelFromSuspicious(request: SuspiciousRequest): string {
  return `${request.method} ${normalizeUrlPattern(request.url)}`;
}
