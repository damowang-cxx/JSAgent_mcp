import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import type { BattlefieldSnapshotRegistryLike } from '../battlefield/lineage.js';
import { buildBattlefieldLineageContribution, readBattlefieldLineageSnapshot, uniqueStrings as uniqueBattlefieldStrings } from '../battlefield/lineage.js';
import type { CodeCollector } from '../collector/CodeCollector.js';
import { AppError } from '../core/errors.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { HookManager } from '../hook/HookManager.js';
import type { NetworkCollector } from '../network/NetworkCollector.js';
import type { RebuildWorkflowRunner } from '../workflow/RebuildWorkflowRunner.js';
import type { PureExtractionRunner } from '../workflow/PureExtractionRunner.js';
import type { ReplayRecipeRunner } from '../replay/ReplayRecipeRunner.js';
import type { ReplayRecipeResult } from '../replay/types.js';
import type { CryptoHelperLocator } from '../scenario/CryptoHelperLocator.js';
import type { RequestSinkLocator } from '../scenario/RequestSinkLocator.js';
import type { SignatureScenarioAnalyzer } from '../scenario/SignatureScenarioAnalyzer.js';
import type { ScenarioWorkflowRunner } from '../scenario/ScenarioWorkflowRunner.js';
import type { ScenarioAnalysisResult, ScenarioWorkflowResult } from '../scenario/types.js';
import type { TokenScenarioAnalyzer } from '../scenario/TokenScenarioAnalyzer.js';
import {
  confidence,
  extractBodyFields,
  extractHeaderFields,
  extractUrlFields,
  targetMatches,
  toRecord,
  uniqueStrings
} from '../scenario/normalization.js';
import type { HelperBoundaryInput, HelperBoundaryOutput, HelperBoundaryResult } from './types.js';

interface HelperBoundaryExtractorDeps {
  browserSession: BrowserSessionManager;
  codeCollector: CodeCollector;
  cryptoHelperLocator: CryptoHelperLocator;
  evidenceStore: EvidenceStore;
  hookManager: HookManager;
  networkCollector: NetworkCollector;
  replayRecipeRunner: ReplayRecipeRunner;
  requestSinkLocator: RequestSinkLocator;
  rebuildWorkflowRunner: RebuildWorkflowRunner;
  pureExtractionRunner: PureExtractionRunner;
  scenarioWorkflowRunner: ScenarioWorkflowRunner;
  signatureScenarioAnalyzer: SignatureScenarioAnalyzer;
  tokenScenarioAnalyzer: TokenScenarioAnalyzer;
  battlefieldIntegrationRegistry?: BattlefieldSnapshotRegistryLike;
}

type ExtractSource = 'scenario-last' | 'capture-last' | 'task-artifact';

const INPUT_NAME_PATTERN = /\b(token|access[_-]?token|auth|authorization|nonce|timestamp|ts|_t|challenge|verify|captcha|fingerprint|salt|key|secret|device)\b/i;
const OUTPUT_NAME_PATTERN = /\b(sign|signature|x-?sign|auth|authorization|token|verify|challenge|captcha|fingerprint|cipher|enc|hash)\b/i;

export class HelperBoundaryExtractor {
  constructor(private readonly deps: HelperBoundaryExtractorDeps) {}

  async extract(options: {
    helperName?: string;
    targetUrl?: string;
    source?: ExtractSource;
    taskId?: string;
  } = {}): Promise<HelperBoundaryResult> {
    const notes: string[] = [];
    const context = await this.readContext(options, notes);
    const helper = await this.resolveHelper(options.helperName, context, notes);
    const code = this.readMergedCode(notes);
    const helperContext = this.findHelperContext(code, helper.name);
    const requests = await this.readRequests(options.targetUrl, context, notes);
    const hookRecords = await this.readHookRecords(notes);
    const tokenTrace = await this.deps.tokenScenarioAnalyzer.trace({
      targetUrl: options.targetUrl
    });
    const sinkResult = await this.deps.requestSinkLocator.locate({
      targetUrl: options.targetUrl,
      topN: 8
    });

    const inputs = this.buildInputs({
      helperContext,
      helperName: helper.name,
      hookRecords,
      requests,
      tokenMemberNames: tokenTrace.members.map((member) => member.name)
    });
    const outputs = this.buildOutputs({
      helperContext,
      helperName: helper.name,
      requests
    });
    const relatedRequests = this.buildRelatedRequests(requests);
    const recommendedHooks = this.buildRecommendedHooks(helper.name, options.targetUrl, sinkResult.topSink ?? undefined);
    const rebuildHints = this.buildRebuildHints(helper.name, inputs, outputs, relatedRequests);
    const pureHints = this.buildPureHints(helper.name, inputs, outputs);
    const battlefieldSnapshot = await readBattlefieldLineageSnapshot(this.deps.battlefieldIntegrationRegistry, {
      preferTaskArtifact: options.source === 'task-artifact',
      taskId: options.taskId
    });
    const battlefield = buildBattlefieldLineageContribution(battlefieldSnapshot, 'helper boundary extraction');

    if (helperContext.length === 0) {
      notes.push('Helper context was not found in collected code; boundary relies on runtime/request/helper locator evidence.');
    }
    if (relatedRequests.length === 0) {
      notes.push('No related request fields were matched for this helper yet.');
    }

    return {
      confidence: this.scoreBoundaryConfidence(inputs, outputs, relatedRequests, helper.confidence),
      file: helper.file,
      helperName: helper.name,
      inputs,
      kind: helper.kind,
      notes: uniqueStrings(uniqueBattlefieldStrings([...notes, ...battlefield.notes], 30), 30),
      outputs,
      pureHints,
      rebuildHints,
      recommendedHooks,
      relatedRequests
    };
  }

  private async readContext(
    options: { source?: ExtractSource; taskId?: string },
    notes: string[]
  ): Promise<{
    capture: ReplayRecipeResult | null;
    scenario: ScenarioWorkflowResult | null;
    analysis: ScenarioAnalysisResult | null;
  }> {
    if (options.source === 'task-artifact' && !options.taskId) {
      throw new AppError(
        'TASK_ID_REQUIRED',
        'extract_helper_boundary with source=task-artifact requires taskId.'
      );
    }

    const context = {
      analysis: null as ScenarioAnalysisResult | null,
      capture: null as ReplayRecipeResult | null,
      scenario: null as ScenarioWorkflowResult | null
    };

    if (options.taskId && (options.source === undefined || options.source === 'task-artifact')) {
      context.capture = await this.readSnapshot<ReplayRecipeResult>(options.taskId, 'scenario/capture/result', this.isReplayRecipeResult, notes);
      context.scenario = await this.readSnapshot<ScenarioWorkflowResult>(options.taskId, 'scenario/workflow', this.isScenarioWorkflowResult, notes);
      context.analysis = await this.readSnapshot<ScenarioAnalysisResult>(options.taskId, 'scenario/analysis', this.isScenarioAnalysisResult, notes);
      if (context.capture || context.scenario || context.analysis || options.source === 'task-artifact') {
        return context;
      }
      notes.push('task artifacts were requested implicitly by taskId, but no scenario/capture snapshots were found; falling back to runtime cache');
    }

    if (options.source === 'capture-last') {
      context.capture = this.deps.replayRecipeRunner.getLastReplayRecipeResult();
      context.analysis = context.capture?.scenarioResult ?? null;
      notes.push('Using capture-last source: scenario workflow cache is intentionally ignored.');
      return context;
    }

    if (options.source === 'scenario-last') {
      context.scenario = this.deps.scenarioWorkflowRunner.getLastScenarioWorkflowResult();
      context.analysis = context.scenario?.analysis ?? null;
      notes.push('Using scenario-last source: replay capture cache is intentionally ignored.');
      return context;
    }

    context.capture = this.deps.replayRecipeRunner.getLastReplayRecipeResult();
    context.scenario = this.deps.scenarioWorkflowRunner.getLastScenarioWorkflowResult();
    context.analysis = context.scenario?.analysis ?? context.capture?.scenarioResult ?? null;
    return context;
  }

  private async resolveHelper(
    helperName: string | undefined,
    context: {
      capture: ReplayRecipeResult | null;
      scenario: ScenarioWorkflowResult | null;
      analysis: ScenarioAnalysisResult | null;
    },
    notes: string[]
  ): Promise<{ name: string; file?: string; kind?: string; confidence: number }> {
    if (helperName) {
      return {
        confidence: 0.85,
        name: helperName
      };
    }

    const scenarioHelper = context.scenario?.helperResult?.helpers.find((helper) => !helper.name.startsWith('crypto:')) ??
      context.scenario?.helperResult?.helpers[0];
    if (scenarioHelper) {
      notes.push('Selected helper from latest scenario helper result.');
      return {
        confidence: scenarioHelper.confidence,
        file: scenarioHelper.file,
        kind: scenarioHelper.kind,
        name: scenarioHelper.name
      };
    }

    const priorityHelper = context.analysis?.priorityTargets.find((target) => target.kind === 'helper');
    if (priorityHelper) {
      notes.push('Selected helper from latest scenario priority target.');
      return {
        confidence: Math.min(0.8, priorityHelper.score / 100),
        name: priorityHelper.target
      };
    }

    const helperResult = await this.deps.cryptoHelperLocator.locate({ topN: 8 });
    const helper = helperResult.helpers.find((item) => !item.name.startsWith('crypto:')) ?? helperResult.helpers[0];
    if (helper) {
      notes.push('Selected helper from crypto helper locator.');
      return {
        confidence: helper.confidence,
        file: helper.file,
        kind: helper.kind,
        name: helper.name
      };
    }

    notes.push('No helper candidate was available; using unknown-helper placeholder.');
    return {
      confidence: 0.2,
      name: 'unknown-helper'
    };
  }

  private readMergedCode(notes: string[]): string {
    try {
      const files = this.deps.codeCollector.getTopPriorityFiles(12).files;
      return files.map((file) => `/* ${file.url} */\n${file.content}`).join('\n');
    } catch (error) {
      notes.push(`Unable to read collected code for helper boundary: ${this.toMessage(error)}`);
      return '';
    }
  }

  private findHelperContext(code: string, helperName: string): string {
    const escaped = escapeRegExp(helperName);
    const index = code.search(new RegExp(`\\b${escaped}\\b`));
    if (index < 0) {
      return '';
    }

    return code.slice(Math.max(0, index - 1_500), Math.min(code.length, index + 3_500));
  }

  private async readRequests(
    targetUrl: string | undefined,
    context: {
      capture: ReplayRecipeResult | null;
      scenario: ScenarioWorkflowResult | null;
      analysis: ScenarioAnalysisResult | null;
    },
    notes: string[]
  ) {
    const requests = new Map<string, { url: string; method: string; postData?: string | null; requestHeaders?: Record<string, string> }>();

    for (const request of context.capture?.observedRequests ?? []) {
      if (targetMatches(request.url, targetUrl)) {
        requests.set(`${request.method}:${request.url}`, {
          method: request.method,
          url: request.url
        });
      }
    }
    for (const request of context.analysis?.suspiciousRequests ?? []) {
      if (targetMatches(request.url, targetUrl)) {
        requests.set(`${request.method}:${request.url}`, {
          method: request.method,
          url: request.url
        });
      }
    }

    try {
      const snapshot = await this.deps.networkCollector.listRequests({ limit: 300 });
      for (const request of snapshot.requests) {
        if (targetMatches(request.url, targetUrl)) {
          requests.set(`${request.method}:${request.url}`, request);
        }
      }
    } catch (error) {
      notes.push(`Unable to read network requests for helper boundary: ${this.toMessage(error)}`);
    }

    return Array.from(requests.values());
  }

  private async readHookRecords(notes: string[]): Promise<Record<string, unknown>[]> {
    try {
      const page = await this.deps.browserSession.getSelectedPage();
      const hookData = await this.deps.hookManager.getHookData(page);
      return Object.values(hookData.records).flat();
    } catch (error) {
      notes.push(`Unable to read hook records for helper boundary: ${this.toMessage(error)}`);
      return [];
    }
  }

  private buildInputs(input: {
    helperContext: string;
    helperName: string;
    hookRecords: readonly Record<string, unknown>[];
    requests: Awaited<ReturnType<HelperBoundaryExtractor['readRequests']>>;
    tokenMemberNames: readonly string[];
  }): HelperBoundaryInput[] {
    const values: HelperBoundaryInput[] = [];

    for (const param of this.extractFunctionParams(input.helperContext, input.helperName)) {
      values.push({
        confidence: INPUT_NAME_PATTERN.test(param) ? 0.82 : 0.58,
        name: param,
        reason: 'function parameter near helper definition',
        source: 'code'
      });
    }

    for (const arg of this.extractCallArgs(input.helperContext, input.helperName)) {
      values.push({
        confidence: INPUT_NAME_PATTERN.test(arg) ? 0.76 : 0.54,
        name: arg,
        reason: 'argument passed to helper call in nearby code',
        source: 'code'
      });
    }

    for (const request of input.requests) {
      for (const field of this.requestFields(request)) {
        if (!INPUT_NAME_PATTERN.test(field.name) && !input.tokenMemberNames.some((name) => sameFamily(name, field.name))) {
          continue;
        }
        values.push({
          confidence: field.source === 'header' ? 0.78 : 0.72,
          name: field.name,
          reason: `request ${field.source} appears related to helper inputs`,
          source: field.source === 'url' ? 'param' : field.source
        });
      }
    }

    for (const key of this.collectHookKeys(input.hookRecords).filter((key) => INPUT_NAME_PATTERN.test(key))) {
      values.push({
        confidence: 0.7,
        name: key,
        reason: 'hook record key matches input family',
        source: 'hook'
      });
    }

    return this.dedupeInputs(values).slice(0, 30);
  }

  private buildOutputs(input: {
    helperContext: string;
    helperName: string;
    requests: Awaited<ReturnType<HelperBoundaryExtractor['readRequests']>>;
  }): HelperBoundaryOutput[] {
    const values: HelperBoundaryOutput[] = [];

    for (const assignment of this.extractAssignments(input.helperContext, input.helperName)) {
      values.push({
        confidence: OUTPUT_NAME_PATTERN.test(assignment) ? 0.84 : 0.62,
        name: assignment,
        reason: 'assignment receives helper call result',
        target: OUTPUT_NAME_PATTERN.test(assignment) ? 'request-param' : 'return'
      });
    }

    if (/\breturn\b/.test(input.helperContext)) {
      values.push({
        confidence: 0.62,
        name: 'return',
        reason: 'helper body or nearby wrapper returns a value',
        target: 'return'
      });
    }

    for (const request of input.requests) {
      for (const field of this.requestFields(request)) {
        if (!OUTPUT_NAME_PATTERN.test(field.name)) {
          continue;
        }
        values.push({
          confidence: field.source === 'header' ? 0.82 : 0.78,
          name: field.name,
          reason: `request ${field.source} likely consumes helper output`,
          target: field.source === 'header' ? 'header' : field.source === 'body-field' ? 'body-field' : 'request-param'
        });
      }
    }

    return this.dedupeOutputs(values).slice(0, 30);
  }

  private buildRelatedRequests(requests: Awaited<ReturnType<HelperBoundaryExtractor['readRequests']>>) {
    return requests
      .map((request) => ({
        matchedFields: this.requestFields(request)
          .filter((field) => INPUT_NAME_PATTERN.test(field.name) || OUTPUT_NAME_PATTERN.test(field.name))
          .map((field) => field.name),
        method: request.method.toUpperCase(),
        url: request.url
      }))
      .filter((request) => request.matchedFields.length > 0)
      .slice(0, 30);
  }

  private buildRecommendedHooks(helperName: string, targetUrl: string | undefined, topSink: string | undefined): string[] {
    return uniqueStrings([
      `hook function ${helperName} to capture args and return value`,
      'hook fetch before send and compare request body/header fields',
      'hook xhr open/send near targetUrl and record method/url/body summary',
      topSink ? `narrow hook around request sink ${topSink}` : '',
      targetUrl ? `add XHR/fetch watchpoint for ${targetUrl}` : ''
    ].filter(Boolean), 10);
  }

  private buildRebuildHints(
    helperName: string,
    inputs: readonly HelperBoundaryInput[],
    outputs: readonly HelperBoundaryOutput[],
    relatedRequests: readonly { url: string; method: string; matchedFields: string[] }[]
  ): string[] {
    const inputNames = inputs.map((input) => input.name).slice(0, 6);
    const outputNames = outputs.map((output) => output.name).slice(0, 4);
    return uniqueStrings([
      `Export helper ${helperName} with the smallest nearby dependency window into a rebuild probe.`,
      inputNames.length > 0
        ? `Keep ${inputNames.join(', ')} as explicit external inputs; do not inline them as constants in the first rebuild.`
        : 'Capture helper args with a function hook before exporting a rebuild probe.',
      outputNames.length > 0
        ? `Validate helper output against request field(s): ${outputNames.join(', ')}.`
        : 'Add one output assertion after the helper return value is observed.',
      relatedRequests[0] ? `Use ${relatedRequests[0].method} ${relatedRequests[0].url} as the request-level validation anchor.` : '',
      'Preserve timestamp/nonce/token freshness fields as fixture inputs until server validation proves they are stable.'
    ].filter(Boolean), 10);
  }

  private buildPureHints(
    helperName: string,
    inputs: readonly HelperBoundaryInput[],
    outputs: readonly HelperBoundaryOutput[]
  ): string[] {
    const inputNames = inputs.map((input) => input.name).slice(0, 6);
    const outputNames = outputs.map((output) => output.name).filter((name) => name !== 'return').slice(0, 4);
    return uniqueStrings([
      inputNames.length > 0
        ? `Pure fixture should freeze helper inputs: ${inputNames.join(', ')}.`
        : `Pure fixture should first capture args for ${helperName}.`,
      outputNames.length > 0
        ? `Treat ${outputNames.join(', ')} as explicit expected output(s).`
        : 'Treat helper return value as the expected output once a hook sample exists.',
      'Separate DOM/runtime state from algorithm inputs before generating a pure scaffold.',
      'Verify helper I/O in Node before porting or broadening the fixture.'
    ], 10);
  }

  private scoreBoundaryConfidence(
    inputs: readonly HelperBoundaryInput[],
    outputs: readonly HelperBoundaryOutput[],
    relatedRequests: readonly unknown[],
    helperConfidence: number
  ): number {
    return confidence(Math.min(0.98, helperConfidence * 0.45 + inputs.length * 0.06 + outputs.length * 0.08 + relatedRequests.length * 0.05));
  }

  private requestFields(request: { url: string; postData?: string | null; requestHeaders?: Record<string, string> }) {
    return [
      ...extractUrlFields(request.url),
      ...extractHeaderFields(request.requestHeaders),
      ...extractBodyFields(request.postData)
    ];
  }

  private extractFunctionParams(context: string, helperName: string): string[] {
    const escaped = escapeRegExp(helperName);
    const patterns = [
      new RegExp(`function\\s+${escaped}\\s*\\(([^)]*)\\)`, 'i'),
      new RegExp(`(?:const|let|var)\\s+${escaped}\\s*=\\s*(?:async\\s*)?\\(([^)]*)\\)\\s*=>`, 'i'),
      new RegExp(`(?:const|let|var)\\s+${escaped}\\s*=\\s*(?:async\\s*)?function\\s*\\(([^)]*)\\)`, 'i')
    ];

    for (const pattern of patterns) {
      const match = context.match(pattern);
      if (match?.[1]) {
        return this.splitNames(match[1]);
      }
    }

    return [];
  }

  private extractCallArgs(context: string, helperName: string): string[] {
    const escaped = escapeRegExp(helperName);
    const values: string[] = [];
    const pattern = new RegExp(`\\b${escaped}\\s*\\(([^)]{0,300})\\)`, 'g');
    for (const match of context.matchAll(pattern)) {
      if (match[1]) {
        values.push(...this.splitNames(match[1]));
      }
      if (values.length >= 20) {
        break;
      }
    }

    return uniqueStrings(values, 20);
  }

  private extractAssignments(context: string, helperName: string): string[] {
    const escaped = escapeRegExp(helperName);
    const values: string[] = [];
    const patterns = [
      new RegExp(`\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${escaped}\\s*\\(`, 'g'),
      new RegExp(`\\b([A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)?)\\s*=\\s*${escaped}\\s*\\(`, 'g')
    ];

    for (const pattern of patterns) {
      for (const match of context.matchAll(pattern)) {
        if (match[1]) {
          values.push(match[1].split('.').pop()!);
        }
      }
    }

    return uniqueStrings(values, 20);
  }

  private splitNames(value: string): string[] {
    return value
      .split(',')
      .map((item) => item.trim().replace(/=.*$/, '').replace(/[{}[\]\s]/g, ''))
      .filter((item) => /^[A-Za-z_$][\w$]*$/.test(item));
  }

  private collectHookKeys(records: readonly Record<string, unknown>[]): string[] {
    const keys: string[] = [];
    const visit = (value: unknown, depth: number): void => {
      if (depth > 3 || keys.length >= 100) {
        return;
      }
      if (Array.isArray(value)) {
        for (const item of value.slice(0, 20)) {
          visit(item, depth + 1);
        }
        return;
      }
      const record = toRecord(value);
      if (!record) {
        return;
      }
      for (const [key, item] of Object.entries(record).slice(0, 60)) {
        keys.push(key);
        visit(item, depth + 1);
      }
    };

    for (const record of records) {
      visit(record, 0);
    }

    return uniqueStrings(keys, 100);
  }

  private dedupeInputs(values: readonly HelperBoundaryInput[]): HelperBoundaryInput[] {
    const byName = new Map<string, HelperBoundaryInput>();
    for (const value of values) {
      const key = `${value.source}:${value.name.toLowerCase()}`;
      const existing = byName.get(key);
      if (!existing || value.confidence > existing.confidence) {
        byName.set(key, value);
      }
    }
    return Array.from(byName.values()).sort((left, right) => right.confidence - left.confidence || left.name.localeCompare(right.name));
  }

  private dedupeOutputs(values: readonly HelperBoundaryOutput[]): HelperBoundaryOutput[] {
    const byName = new Map<string, HelperBoundaryOutput>();
    for (const value of values) {
      const key = `${value.target}:${value.name.toLowerCase()}`;
      const existing = byName.get(key);
      if (!existing || value.confidence > existing.confidence) {
        byName.set(key, value);
      }
    }
    return Array.from(byName.values()).sort((left, right) => right.confidence - left.confidence || left.name.localeCompare(right.name));
  }

  private async readSnapshot<T>(
    taskId: string,
    name: string,
    guard: (value: unknown) => value is T,
    notes: string[]
  ): Promise<T | null> {
    try {
      const snapshot = await this.deps.evidenceStore.readSnapshot(taskId, name);
      return guard(snapshot) ? snapshot : null;
    } catch (error) {
      notes.push(`Unable to read task snapshot ${name}: ${this.toMessage(error)}`);
      return null;
    }
  }

  private isReplayRecipeResult(value: unknown): value is ReplayRecipeResult {
    return Boolean(value && typeof value === 'object' && 'executedSteps' in value && 'observedRequests' in value);
  }

  private isScenarioWorkflowResult(value: unknown): value is ScenarioWorkflowResult {
    return Boolean(value && typeof value === 'object' && 'preset' in value && 'analysis' in value);
  }

  private isScenarioAnalysisResult(value: unknown): value is ScenarioAnalysisResult {
    return Boolean(value && typeof value === 'object' && 'scenario' in value && 'priorityTargets' in value);
  }

  private toMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sameFamily(left: string, right: string): boolean {
  const normalizedLeft = left.toLowerCase().replace(/[_-]/g, '');
  const normalizedRight = right.toLowerCase().replace(/[_-]/g, '');
  return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
}
