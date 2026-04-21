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
  scoreNetworkRequest
} from './heuristics.js';
import {
  clampScore,
  dedupeBy,
  normalizeUrlPattern,
  requestText,
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

interface ScenarioProfile {
  scenario: ScenarioType;
  label: string;
  keywordPattern: RegExp;
  keywordFamilies: string[];
  helperFirst: boolean;
  requestFirst: boolean;
  notes: string[];
  actionNoun: string;
}

export class SignatureScenarioAnalyzer {
  constructor(private readonly deps: SignatureScenarioAnalyzerDeps) {}

  async analyze(options: SignatureAnalyzeOptions = {}): Promise<ScenarioAnalysisResult> {
    const scenario = options.scenario ?? 'api-signature';
    const profile = this.getScenarioProfile(scenario);
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
    const candidateFunctions = this.rankByScenarioProfile(uniqueStrings([
      ...extractCandidateFunctionNames(mergedCode, 80),
      ...understanding.structure.candidateFunctions,
      ...(lastAnalyze?.understanding.structure.candidateFunctions ?? []),
      ...(lastAnalyze?.priorityTargets.filter((target) => target.type === 'function').map((target) => target.label) ?? []),
      ...helperResult.helpers.map((helper) => helper.name).filter((name) => !name.startsWith('crypto:'))
    ], 60), profile);

    const requestSinks = uniqueStrings([
      ...sinkResult.sinks.map((sink) => sink.sink),
      ...(lastAnalyze?.requestFingerprints.map((fingerprint) => `${fingerprint.method} ${fingerprint.pattern}`) ?? [])
    ], 40);

    const indicators = this.buildIndicators({
      code: mergedCode,
      cryptoAlgorithms: crypto.algorithms.map((algorithm) => algorithm.name),
      helperResult,
      hookIndicators,
      profile,
      requests,
      requestSinks
    });
    const suspiciousRequests = this.buildSuspiciousRequests({
      correlation,
      hookIndicators,
      profile,
      requests,
      sinkResult,
      targetUrl: options.targetUrl
    });
    const priorityTargets = this.buildPriorityTargets({
      candidateFunctions,
      helperNames: helperResult.helpers.map((helper) => helper.name),
      indicators,
      profile,
      requestSinks,
      suspiciousRequests
    });
    const nextActions = this.buildNextActions({
      candidateFunctions,
      helperNames: helperResult.helpers.map((helper) => helper.name),
      hookIndicatorCount: hookIndicators.length,
      priorityTargets,
      profile,
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
    notes.push(`Scenario profile applied: ${profile.label}.`);
    notes.push(...profile.notes);
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
    profile: ScenarioProfile;
    requests: Awaited<ReturnType<SignatureScenarioAnalyzer['readRequests']>>;
    requestSinks: readonly string[];
  }): ScenarioIndicator[] {
    const indicators: ScenarioIndicator[] = [];

    indicators.push(...input.requests.flatMap((request) => indicatorsFromRequest(request)));
    indicators.push(...input.hookIndicators);
    indicators.push(...indicatorsFromText(input.code, { reasonPrefix: 'top-priority code' }));
    indicators.push(...this.scenarioIndicatorsFromText(input.code, input.profile, 'top-priority code'));
    indicators.push(...input.requests.flatMap((request) =>
      this.scenarioIndicatorsFromText(requestText(request), input.profile, `request ${request.method.toUpperCase()} ${normalizeUrlPattern(request.url)}`)
    ));
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
    profile: ScenarioProfile;
    requests: Awaited<ReturnType<SignatureScenarioAnalyzer['readRequests']>>;
    sinkResult: Awaited<ReturnType<RequestSinkLocator['locate']>>;
    targetUrl?: string;
  }): SuspiciousRequest[] {
    const fingerprintScores = new Map<string, { score: number; indicators: string[]; matchedInitiators: number }>();
    const hookScores = new Map<string, { count: number; indicators: string[] }>();

    for (const fingerprint of input.correlation?.requestFingerprints ?? []) {
      for (const sampleUrl of fingerprint.sampleUrls) {
        fingerprintScores.set(normalizeUrlPattern(sampleUrl), {
          indicators: fingerprint.signatureIndicators,
          matchedInitiators: fingerprint.matchedInitiators,
          score: fingerprint.suspiciousScore
        });
      }
    }

    for (const item of input.correlation?.timeline ?? []) {
      if (!item.url || item.source !== 'hook') {
        continue;
      }
      const pattern = normalizeUrlPattern(item.url);
      const existing = hookScores.get(pattern) ?? { count: 0, indicators: [] };
      const scenarioIndicators = this.scenarioIndicatorNames(`${item.url}\n${JSON.stringify(item.raw ?? {})}`, input.profile);
      existing.count += item.signatureIndicators.length + scenarioIndicators.length;
      existing.indicators = uniqueStrings([...existing.indicators, ...item.signatureIndicators, ...scenarioIndicators], 20);
      hookScores.set(pattern, existing);
    }

    const globalHookScenarioIndicators = uniqueStrings([
      ...input.hookIndicators.map((indicator) => indicator.value),
      ...input.hookIndicators.flatMap((indicator) => this.scenarioIndicatorNames(indicator.value, input.profile))
    ], 20);

    const requests = input.requests.map((request) => {
      const correlation = fingerprintScores.get(normalizeUrlPattern(request.url));
      const hookEvidence = hookScores.get(normalizeUrlPattern(request.url));
      const scenarioIndicators = this.scenarioIndicatorNames(requestText(request), input.profile);
      const sinkDistanceScore = this.scoreSinkProximity(request.url, input.sinkResult);
      const scored = scoreNetworkRequest(request, {
        correlatedIndicators: correlation?.indicators,
        fingerprintScore: correlation?.score,
        hookIndicatorCount: (hookEvidence?.count ?? 0) + (globalHookScenarioIndicators.length > 0 ? 1 : 0),
        matchedInitiators: correlation?.matchedInitiators,
        scenarioBonus: scenarioIndicators.length * 6,
        scenarioIndicators: [...scenarioIndicators, ...(hookEvidence?.indicators ?? [])],
        sinkDistanceScore,
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
        indicators: uniqueStrings([...flow.signatureIndicators, ...this.scenarioIndicatorNames(`${flow.url}\n${flow.events.join('\n')}`, input.profile)], 20),
        method: flow.method,
        score: clampScore(
          55 +
            flow.signatureIndicators.length * 8 +
            flow.matchedInitiators * 4 +
            this.scenarioIndicatorNames(`${flow.url}\n${flow.events.join('\n')}`, input.profile).length * 6 +
            this.scoreSinkProximity(flow.url, input.sinkResult)
        ),
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
    profile: ScenarioProfile;
    requestSinks: readonly string[];
    suspiciousRequests: readonly SuspiciousRequest[];
  }): PriorityTarget[] {
    const targets: PriorityTarget[] = [];

    for (const request of input.suspiciousRequests.slice(0, 8)) {
      const scenarioHits = this.scenarioIndicatorNames(`${request.url}\n${request.indicators.join('\n')}`, input.profile);
      targets.push({
        kind: 'request',
        reasons: [
          `request score ${request.score}`,
          request.indicators.length > 0 ? `matched indicators: ${request.indicators.join(', ')}` : '',
          scenarioHits.length > 0 ? `${input.profile.label} indicators: ${scenarioHits.join(', ')}` : '',
          /^(POST|PUT|PATCH|DELETE)$/i.test(request.method) ? `write-like method ${request.method}` : ''
        ].filter(Boolean),
        score: clampScore(request.score + (input.profile.requestFirst ? 8 : 0) + scenarioHits.length * 3),
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
      const scenarioMatches = input.profile.keywordPattern.test(name);
      input.profile.keywordPattern.lastIndex = 0;
      targets.push({
        kind: 'function',
        reasons: [
          'function name matches sign/token/auth/nonce/crypto scenario keywords',
          scenarioMatches ? `prioritized by ${input.profile.label} profile` : '',
          input.suspiciousRequests.length > 0 ? `paired with top request ${requestPatternLabelFromSuspicious(input.suspiciousRequests[0]!)}` : ''
        ].filter(Boolean),
        score: clampScore(64 + (scenarioMatches ? 14 : 0)),
        target: name
      });
    }

    for (const helper of input.helperNames.slice(0, 8)) {
      const scenarioMatches = input.profile.keywordPattern.test(helper);
      input.profile.keywordPattern.lastIndex = 0;
      targets.push({
        kind: 'helper',
        reasons: [
          'crypto helper locator marked this helper for audit',
          input.profile.helperFirst ? 'helper-first scenario boosts helper priority' : '',
          scenarioMatches ? `helper matches ${input.profile.label} keywords` : ''
        ].filter(Boolean),
        score: clampScore((helper.startsWith('crypto:') ? 48 : 62) + (input.profile.helperFirst ? 26 : 0) + (scenarioMatches ? 8 : 0)),
        target: helper
      });
    }

    for (const value of indicatorsToStrings(input.indicators).slice(0, 8)) {
      const scenarioMatches = input.profile.keywordPattern.test(value);
      input.profile.keywordPattern.lastIndex = 0;
      targets.push({
        kind: 'param',
        reasons: [
          'indicator appears in request/code/hook evidence',
          scenarioMatches ? `indicator matches ${input.profile.label} profile` : ''
        ].filter(Boolean),
        score: clampScore(46 + (scenarioMatches ? 12 : 0)),
        target: value
      });
    }

    return dedupeBy(
      targets.sort((left, right) =>
        this.priorityKindBoost(right.kind, input.profile) - this.priorityKindBoost(left.kind, input.profile) ||
        right.score - left.score ||
        left.target.localeCompare(right.target)
      ),
      (target) => `${target.kind}:${target.target}`
    ).slice(0, 25);
  }

  private buildNextActions(input: {
    candidateFunctions: readonly string[];
    helperNames: readonly string[];
    hookIndicatorCount: number;
    priorityTargets: readonly PriorityTarget[];
    profile: ScenarioProfile;
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
        step: `Prioritize ${topRequest.method} ${normalizeUrlPattern(topRequest.url)} and compare ${input.profile.actionNoun} indicators: ${topRequest.indicators.slice(0, 6).join(', ') || 'none'}.`,
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
        step: `Search collected code for ${topFunction}, then inspect callers and arguments around ${input.profile.actionNoun} fields.`,
        stopIf: 'Stop static expansion if the function is not on the target request path.'
      });
    }

    if (input.profile.helperFirst && topHelper) {
      actions.unshift({
        purpose: 'Start from the helper boundary because this preset is helper-first.',
        step: `Review helper ${topHelper}, then map its output to any request parameter or hook return value.`,
        stopIf: 'Stop helper-first analysis if no request-bound parameter consumes this helper output.'
      });
    } else if (topHelper) {
      actions.push({
        purpose: 'Prepare helper-boundary extraction for rebuild or pure extraction.',
        step: `Run deobfuscate_code or focused review around helper ${topHelper}, then capture one input/output sample with a function hook if possible.`,
        stopIf: 'Stop helper extraction if no request-bound parameter consumes its output.'
      });
    }

    if (input.profile.scenario === 'anti-bot') {
      actions.push({
        purpose: 'Keep anti-bot capture focused on challenge material.',
        step: 'Compare challenge/verify/captcha/fingerprint fields before and after the protected action; avoid broad storage snapshots unless the field source is unknown.',
        stopIf: 'Stop anti-bot expansion once challenge parameters are bound to one request and one generating helper or hook record.'
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

  private getScenarioProfile(scenario: ScenarioType): ScenarioProfile {
    switch (scenario) {
      case 'anti-bot':
        return {
          actionNoun: 'challenge/verify/captcha/fingerprint',
          helperFirst: false,
          keywordFamilies: ['challenge', 'verify', 'captcha', 'fingerprint', 'fp', 'risk', 'device', 'webdriver', 'slider', 'nonce'],
          keywordPattern: /\b(challenge|verify|verification|captcha|fingerprint|fp|risk|device|webdriver|slider|validate|nonce|anti[-_]?bot)\b/i,
          label: 'anti-bot challenge',
          notes: ['Anti-bot profile boosts challenge, verify, captcha, fingerprint, risk, device, and nonce evidence.'],
          requestFirst: true,
          scenario
        };
      case 'crypto-helper':
        return {
          actionNoun: 'crypto/hash/encode helper',
          helperFirst: true,
          keywordFamilies: ['hmac', 'hash', 'md5', 'sha', 'aes', 'rsa', 'base64', 'encrypt', 'decrypt', 'cipher', 'digest', 'encode', 'decode'],
          keywordPattern: /\b(hmac|hash|md5|sha-?1|sha-?256|sha-?512|aes|rsa|base64|encrypt|decrypt|cipher|digest|encode|decode|CryptoJS|crypto\.subtle)\b/i,
          label: 'crypto-helper',
          notes: ['Crypto-helper profile is helper-first: helper/function targets are promoted ahead of request-only targets.'],
          requestFirst: false,
          scenario
        };
      case 'token-family':
        return {
          actionNoun: 'token/auth/refresh/nonce',
          helperFirst: false,
          keywordFamilies: ['token', 'access_token', 'refresh_token', 'auth', 'authorization', 'bearer', 'nonce', 'verify', 'sign'],
          keywordPattern: /\b(access[_-]?token|refresh[_-]?token|token|auth|authorization|bearer|nonce|verify|sign(?:ature)?)\b/i,
          label: 'token-family',
          notes: ['Token-family profile boosts token/auth/refresh/nonce request bindings and transformations.'],
          requestFirst: true,
          scenario
        };
      case 'api-signature':
      default:
        return {
          actionNoun: 'sign/token/auth/nonce',
          helperFirst: false,
          keywordFamilies: ['sign', 'signature', 'x-sign', 'token', 'auth', 'nonce', 'timestamp', 'hmac', 'hash'],
          keywordPattern: /\b(x-?sign|sign(?:ature)?|token|auth|authorization|nonce|timestamp|ts|hmac|hash|md5|sha)\b/i,
          label: 'api-signature',
          notes: ['API-signature profile boosts sign, token, auth, nonce, timestamp, hash, and HMAC evidence.'],
          requestFirst: true,
          scenario
        };
    }
  }

  private rankByScenarioProfile(values: readonly string[], profile: ScenarioProfile): string[] {
    return [...values].sort((left, right) => {
      const leftMatches = profile.keywordPattern.test(left);
      profile.keywordPattern.lastIndex = 0;
      const rightMatches = profile.keywordPattern.test(right);
      profile.keywordPattern.lastIndex = 0;
      return Number(rightMatches) - Number(leftMatches) || left.localeCompare(right);
    });
  }

  private scenarioIndicatorsFromText(text: string, profile: ScenarioProfile, reasonPrefix: string): ScenarioIndicator[] {
    return this.scenarioIndicatorNames(text, profile).map((value) => ({
      confidence: 0.82,
      reason: `${reasonPrefix}: matched ${profile.label} keyword family`,
      type: profile.helperFirst ? ('crypto' as const) : ('param' as const),
      value
    }));
  }

  private scenarioIndicatorNames(text: string, profile: ScenarioProfile): string[] {
    const lower = text.toLowerCase();
    return profile.keywordFamilies.filter((family) => lower.includes(family.toLowerCase()));
  }

  private scoreSinkProximity(url: string, sinkResult: Awaited<ReturnType<RequestSinkLocator['locate']>>): number {
    const requestPattern = normalizeUrlPattern(url);
    let bestScore = 0;

    for (const sink of sinkResult.sinks) {
      const relatedMatch = sink.relatedUrls.some((relatedUrl) =>
        relatedUrl === url || normalizeUrlPattern(relatedUrl) === requestPattern || url.includes(relatedUrl) || relatedUrl.includes(url)
      );
      if (relatedMatch) {
        bestScore = Math.max(bestScore, sink.source === 'code' ? 16 : 12);
        continue;
      }

      if (sink.relatedUrls.length === 0 && sink.source === 'code') {
        bestScore = Math.max(bestScore, 4);
      }
    }

    return bestScore;
  }

  private priorityKindBoost(kind: PriorityTarget['kind'], profile: ScenarioProfile): number {
    if (profile.helperFirst) {
      if (kind === 'helper') {
        return 40;
      }
      if (kind === 'function') {
        return 24;
      }
      if (kind === 'request') {
        return 8;
      }
    }

    if (profile.scenario === 'anti-bot') {
      if (kind === 'param') {
        return 28;
      }
      if (kind === 'request') {
        return 24;
      }
    }

    return kind === 'request' ? 16 : 0;
  }

  private toMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

function requestPatternLabelFromSuspicious(request: SuspiciousRequest): string {
  return `${request.method} ${normalizeUrlPattern(request.url)}`;
}
