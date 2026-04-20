import { setTimeout as delay } from 'node:timers/promises';

import type { Page } from 'puppeteer';

import type { CodeSummarizer } from '../analysis/CodeSummarizer.js';
import type { CryptoDetector } from '../analysis/CryptoDetector.js';
import type { RiskScorer } from '../analysis/RiskScorer.js';
import type { StaticAnalyzer } from '../analysis/StaticAnalyzer.js';
import type { AnalyzeTargetResult, PriorityTarget, RequestFingerprint } from '../analysis/types.js';
import { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import type { CodeCollector } from '../collector/CodeCollector.js';
import type { CodeFile, CollectCodeOptions, CollectCodeResult, TopPriorityCollectedCodeResult } from '../collector/types.js';
import { AppError } from '../core/errors.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { HookManager } from '../hook/HookManager.js';
import type { NetworkCollector } from '../network/NetworkCollector.js';
import type { NetworkRequestRecord } from '../network/types.js';
import type { RequestInitiatorTracker } from '../network/RequestInitiatorTracker.js';
import type { AnalyzeTargetOptions } from './types.js';

interface AnalyzeTargetRunnerDeps {
  browserSession: BrowserSessionManager;
  codeCollector: CodeCollector;
  codeSummarizer: CodeSummarizer;
  cryptoDetector: CryptoDetector;
  evidenceStore: EvidenceStore;
  hookManager: HookManager;
  networkCollector: NetworkCollector;
  requestInitiatorTracker: RequestInitiatorTracker;
  riskScorer: RiskScorer;
  staticAnalyzer: StaticAnalyzer;
}

const DEFAULT_TOP_N = 6;
const DEFAULT_MAX_FINGERPRINTS = 10;
const NETWORK_SAMPLE_LIMIT = 200;

export class AnalyzeTargetRunner {
  constructor(private readonly deps: AnalyzeTargetRunnerDeps) {}

  async analyze(options: AnalyzeTargetOptions): Promise<AnalyzeTargetResult> {
    if (!options.url || options.url.trim().length === 0) {
      throw new AppError('ANALYZE_TARGET_URL_REQUIRED', 'analyze_target requires a url.');
    }

    const topN = Math.max(1, options.topN ?? DEFAULT_TOP_N);
    const maxFingerprints = Math.max(1, options.maxFingerprints ?? DEFAULT_MAX_FINGERPRINTS);
    await this.preparePage(options.url);

    const collection = await this.deps.codeCollector.collect(this.toCollectOptions(options.collect));
    const topPriority = this.deps.codeCollector.getTopPriorityFiles(topN, options.collect?.maxTotalSize);
    const analysisFiles = topPriority.files.length > 0 ? topPriority.files : collection.files.slice(0, topN);
    const mergedCode = this.mergeCode(analysisFiles);
    const preset = options.hookPreset ?? (options.autoInjectHooks ? 'api-signature' : 'none');
    const hooksInjected = await this.injectHooksIfNeeded(preset, options.autoInjectHooks);

    if (options.waitAfterHookMs && options.waitAfterHookMs > 0) {
      await delay(options.waitAfterHookMs);
    }

    const [topFilesSummary, projectSummary, understanding, crypto] = await Promise.all([
      this.deps.codeSummarizer.summarizeBatch(analysisFiles),
      this.deps.codeSummarizer.summarizeProject(collection.files),
      this.deps.staticAnalyzer.understand({ code: mergedCode, focus: 'all' }),
      this.deps.cryptoDetector.detect({ code: mergedCode })
    ]);

    await this.deps.networkCollector.ensureAttachedToSelectedPage();
    const networkSnapshot = await this.readNetworkSnapshot();
    const suspiciousRequests = networkSnapshot.requests.filter((request) => this.isSuspiciousRequest(request)).length;
    const requestFingerprints = this.buildRequestFingerprints(networkSnapshot.requests, maxFingerprints);
    const hookSignalCount = await this.countHookSignals();
    const risk = await this.deps.riskScorer.score({
      crypto,
      hookSignalCount,
      staticAnalysis: understanding,
      suspiciousNetworkRequests: suspiciousRequests
    });
    const page = await this.readSelectedPage();
    const priorityTargets = this.buildPriorityTargets({
      cryptoAlgorithms: crypto.algorithms.map((item) => item.name),
      candidateFunctions: understanding.structure.candidateFunctions,
      hooksInjected,
      requestFingerprints
    });
    const recommendedNextSteps = this.buildRecommendedNextSteps({
      priorityTargets,
      riskLevel: risk.level,
      suspiciousRequests
    });
    const result: AnalyzeTargetResult = {
      collection: {
        topPriorityFiles: this.toTopPrioritySummaries(topPriority),
        totalFiles: collection.totalFiles,
        totalSize: collection.totalSize,
        warnings: collection.warnings
      },
      crypto,
      hooks: {
        injected: hooksInjected,
        preset,
        signalCount: hookSignalCount
      },
      network: {
        recentRequests: networkSnapshot.requests.slice(-20),
        suspiciousRequests,
        totalObserved: networkSnapshot.total
      },
      page,
      priorityTargets,
      recommendedNextSteps,
      requestFingerprints,
      risk,
      stopIf: this.buildStopConditions(collection, analysisFiles, risk.score),
      summaries: {
        project: projectSummary,
        topFiles: topFilesSummary
      },
      target: {
        goal: options.goal,
        targetUrl: options.targetUrl,
        url: options.url
      },
      understanding,
      whyTheseSteps: recommendedNextSteps.map((step) => step.reason)
    };

    if (options.writeEvidence && options.taskId) {
      result.task = await this.writeEvidence(options, result, networkSnapshot.requests);
    } else {
      result.task = null;
    }

    return result;
  }

  private async preparePage(url: string): Promise<void> {
    const selectedPage = await this.deps.browserSession.getSelectedPageOrNull();
    if (!selectedPage) {
      await this.deps.browserSession.newPage();
    }

    await this.deps.networkCollector.ensureAttachedToSelectedPage();
    await this.deps.requestInitiatorTracker.ensureAttachedToSelectedPage();
    await this.deps.browserSession.navigateSelectedPage({
      type: 'url',
      url
    });
    await this.deps.networkCollector.ensureAttachedToSelectedPage();
    await this.deps.requestInitiatorTracker.ensureAttachedToSelectedPage();
  }

  private toCollectOptions(options: AnalyzeTargetOptions['collect']): CollectCodeOptions {
    return {
      includeDynamic: options?.includeDynamic,
      includeExternal: options?.includeExternal ?? true,
      includeInline: options?.includeInline ?? true,
      dynamicWaitMs: options?.dynamicWaitMs,
      maxFileSize: options?.maxFileSize,
      maxTotalSize: options?.maxTotalSize
    };
  }

  private async injectHooksIfNeeded(
    preset: AnalyzeTargetOptions['hookPreset'] | 'none',
    autoInjectHooks: boolean | undefined
  ): Promise<string[]> {
    if (preset === 'none' || autoInjectHooks === false) {
      return [];
    }

    const page = await this.deps.browserSession.getSelectedPage();
    const hookTypes: Array<'fetch' | 'xhr'> = ['fetch', 'xhr'];
    const injected: string[] = [];

    for (const hookType of hookTypes) {
      const hookId = `analyze-target-${hookType}`;
      let hook = this.deps.hookManager.getHook(hookId);
      if (!hook) {
        hook = this.deps.hookManager.createHook({
          description: `[analyze_target] ${hookType} hook`,
          hookId,
          type: hookType
        });
      }

      await this.deps.hookManager.injectHook(hook.hookId, page, {
        currentDocument: true,
        futureDocuments: true
      });
      injected.push(hook.hookId);
    }

    return injected;
  }

  private mergeCode(files: readonly CodeFile[]): string {
    return files
      .map((file) => `\n/* JSAGENT_FILE: ${file.url} */\n${file.content}`)
      .join('\n');
  }

  private async readNetworkSnapshot(): Promise<{ total: number; requests: NetworkRequestRecord[] }> {
    try {
      return this.deps.networkCollector.listRequests({ limit: NETWORK_SAMPLE_LIMIT });
    } catch {
      return {
        requests: [],
        total: 0
      };
    }
  }

  private async countHookSignals(): Promise<number> {
    try {
      const page = await this.deps.browserSession.getSelectedPage();
      const hookData = await this.deps.hookManager.getHookData(page);
      return Object.values(hookData.records).reduce((total, records) => total + records.length, 0);
    } catch {
      return 0;
    }
  }

  private async readSelectedPage(): Promise<AnalyzeTargetResult['page']> {
    const page: Page = await this.deps.browserSession.getSelectedPage();
    let title = '';
    try {
      title = await page.title();
    } catch {
      title = '';
    }

    return {
      title,
      url: page.url()
    };
  }

  private buildRequestFingerprints(
    requests: readonly NetworkRequestRecord[],
    maxFingerprints: number
  ): RequestFingerprint[] {
    const byKey = new Map<string, {
      method: string;
      pattern: string;
      requests: NetworkRequestRecord[];
    }>();

    for (const request of requests) {
      const pattern = this.normalizeRequestPattern(request.url);
      const method = request.method.toUpperCase();
      const key = `${method} ${pattern}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.requests.push(request);
      } else {
        byKey.set(key, {
          method,
          pattern,
          requests: [request]
        });
      }
    }

    return Array.from(byKey.values())
      .map((entry) => ({
        count: entry.requests.length,
        method: entry.method,
        pattern: entry.pattern,
        sampleUrls: Array.from(new Set(entry.requests.map((request) => request.url))).slice(0, 3),
        suspiciousScore: this.scoreRequestFingerprint(entry.requests)
      }))
      .sort((left, right) => right.suspiciousScore - left.suspiciousScore || right.count - left.count)
      .slice(0, maxFingerprints);
  }

  private normalizeRequestPattern(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.pathname = parsed.pathname
        .split('/')
        .map((segment) => {
          if (/^\d{3,}$/.test(segment)) {
            return ':id';
          }
          if (/^[a-f0-9]{16,}$/i.test(segment)) {
            return ':hex';
          }
          return segment;
        })
        .join('/');

      const queryKeys = Array.from(parsed.searchParams.keys()).sort();
      parsed.search = queryKeys.length > 0 ? `?keys=${queryKeys.join(',')}` : '';
      parsed.hash = '';
      return parsed.toString();
    } catch {
      return url.replace(/[a-f0-9]{16,}/gi, ':hex').replace(/\d{3,}/g, ':id');
    }
  }

  private scoreRequestFingerprint(requests: readonly NetworkRequestRecord[]): number {
    const hasSuspiciousUrl = requests.some((request) => /sign|signature|token|auth|api|nonce/i.test(request.url));
    const hasWriteMethod = requests.some((request) => /^(POST|PUT|PATCH)$/i.test(request.method));
    const hasBody = requests.some((request) => Boolean(request.postData));
    return Math.min(100, requests.length * 5 + (hasSuspiciousUrl ? 35 : 0) + (hasWriteMethod ? 25 : 0) + (hasBody ? 15 : 0));
  }

  private isSuspiciousRequest(request: NetworkRequestRecord): boolean {
    return /sign|signature|token|auth|api|nonce/i.test(request.url) || /^(POST|PUT|PATCH)$/i.test(request.method);
  }

  private buildPriorityTargets(input: {
    requestFingerprints: readonly RequestFingerprint[];
    candidateFunctions: readonly string[];
    cryptoAlgorithms: readonly string[];
    hooksInjected: readonly string[];
  }): PriorityTarget[] {
    const targets: PriorityTarget[] = [];

    for (const fingerprint of input.requestFingerprints.filter((item) => item.suspiciousScore >= 35).slice(0, 5)) {
      targets.push({
        label: `${fingerprint.method} ${fingerprint.pattern}`,
        reason: 'Suspicious request fingerprint based on URL keywords, write method, body, or frequency.',
        score: fingerprint.suspiciousScore,
        type: 'request'
      });
    }

    for (const functionName of input.candidateFunctions.slice(0, 8)) {
      targets.push({
        label: functionName,
        reason: 'Function name suggests signing, token, hash, nonce, auth, or crypto behavior.',
        score: 65,
        type: 'function'
      });
    }

    for (const algorithm of input.cryptoAlgorithms.slice(0, 8)) {
      targets.push({
        label: algorithm,
        reason: 'Crypto detector matched this algorithm or concept in top-priority code.',
        score: 55,
        type: 'crypto'
      });
    }

    for (const hookId of input.hooksInjected) {
      targets.push({
        label: hookId,
        reason: 'Hook was injected and can capture runtime samples after the target action is triggered.',
        score: 45,
        type: 'hook'
      });
    }

    return targets.sort((left, right) => right.score - left.score).slice(0, 20);
  }

  private buildRecommendedNextSteps(input: {
    priorityTargets: readonly PriorityTarget[];
    riskLevel: string;
    suspiciousRequests: number;
  }): AnalyzeTargetResult['recommendedNextSteps'] {
    const steps: AnalyzeTargetResult['recommendedNextSteps'] = [];

    if (input.suspiciousRequests > 0) {
      steps.push({
        action: 'Inspect suspicious request initiators and compare them with hook records.',
        reason: 'Suspicious API/sign/auth/nonce traffic was observed during analysis.',
        tool: 'list_network_requests'
      });
    } else {
      steps.push({
        action: 'Trigger the target interaction once, then list network requests again.',
        reason: 'No suspicious request was observed yet; dynamic action may be required.',
        tool: 'list_network_requests'
      });
    }

    const functionTarget = input.priorityTargets.find((target) => target.type === 'function');
    if (functionTarget) {
      steps.push({
        action: `Search and inspect candidate function ${functionTarget.label}.`,
        params: {
          pattern: functionTarget.label
        },
        reason: functionTarget.reason,
        tool: 'search_collected_code'
      });
    }

    const cryptoTarget = input.priorityTargets.find((target) => target.type === 'crypto');
    if (cryptoTarget) {
      steps.push({
        action: `Review crypto usage around ${cryptoTarget.label}.`,
        reason: cryptoTarget.reason,
        tool: 'detect_crypto'
      });
    }

    if (input.riskLevel === 'high') {
      steps.push({
        action: 'Persist a focused evidence snapshot before attempting rebuild or deobfuscation.',
        reason: 'High risk score means static findings and runtime observations should be preserved.',
        tool: 'record_reverse_evidence'
      });
    }

    return steps;
  }

  private buildStopConditions(
    collection: CollectCodeResult,
    analysisFiles: readonly CodeFile[],
    riskScore: number
  ): string[] {
    const conditions = [
      'Stop if the target action cannot be reproduced after hooks are active; collect more runtime evidence first.',
      'Stop before deobfuscation if the top-priority files do not include the suspected signature or request builder.'
    ];

    if (collection.totalFiles === 0 || analysisFiles.length === 0) {
      conditions.unshift('Stop because no JavaScript files were collected; fix browser/page collection before deeper analysis.');
    }
    if (riskScore < 20) {
      conditions.push('Stop escalating risk conclusions if no static risk, crypto, or suspicious network signal is present.');
    }

    return conditions;
  }

  private async writeEvidence(
    options: AnalyzeTargetOptions,
    result: AnalyzeTargetResult,
    recentRequests: readonly NetworkRequestRecord[]
  ): Promise<{ taskId: string; taskDir: string }> {
    const task = await this.deps.evidenceStore.openTask({
      goal: options.goal,
      slug: options.taskSlug,
      targetUrl: options.targetUrl ?? options.url,
      taskId: options.taskId!
    });

    await this.deps.evidenceStore.appendLog(task.taskId, 'runtime-evidence', {
      kind: 'analyze_target',
      priorityTargets: result.priorityTargets,
      risk: result.risk,
      summaries: result.summaries
    });
    await this.deps.evidenceStore.writeSnapshot(task.taskId, 'analyze-target-summary', {
      crypto: result.crypto,
      page: result.page,
      priorityTargets: result.priorityTargets,
      recommendedNextSteps: result.recommendedNextSteps,
      requestFingerprints: result.requestFingerprints,
      risk: result.risk,
      target: result.target,
      understanding: result.understanding
    });
    await this.deps.evidenceStore.writeSnapshot(task.taskId, 'network-summary', {
      recentRequests: recentRequests.slice(-50),
      requestFingerprints: result.requestFingerprints,
      suspiciousRequests: result.network.suspiciousRequests,
      totalObserved: result.network.totalObserved
    });
    await this.deps.evidenceStore.writeSnapshot(task.taskId, 'code-summary', {
      collection: result.collection,
      summaries: result.summaries
    });

    return {
      taskDir: task.taskDir,
      taskId: task.taskId
    };
  }

  private toTopPrioritySummaries(topPriority: TopPriorityCollectedCodeResult): AnalyzeTargetResult['collection']['topPriorityFiles'] {
    return topPriority.files.map((file) => ({
      reasons: file.reasons,
      score: file.score,
      size: file.size,
      type: file.type,
      url: file.url
    }));
  }
}
