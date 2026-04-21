import type { RankedCodeFile } from '../collector/types.js';
import type { CodeCollector } from '../collector/CodeCollector.js';
import { AppError } from '../core/errors.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { HelperBoundaryExtractor } from '../helper/HelperBoundaryExtractor.js';
import type { HelperBoundaryRegistry } from '../helper/HelperBoundaryRegistry.js';
import type { HelperBoundaryResult, StoredHelperBoundary } from '../helper/types.js';
import type { ReplayRecipeRunner } from '../replay/ReplayRecipeRunner.js';
import type { ReplayRecipeResult } from '../replay/types.js';
import type { CryptoHelperLocator } from '../scenario/CryptoHelperLocator.js';
import type { RequestSinkLocator } from '../scenario/RequestSinkLocator.js';
import type { ScenarioWorkflowRunner } from '../scenario/ScenarioWorkflowRunner.js';
import type { SignatureScenarioAnalyzer } from '../scenario/SignatureScenarioAnalyzer.js';
import type {
  CryptoHelperResult,
  RequestSinkResult,
  ScenarioAnalysisResult,
  ScenarioWorkflowResult,
  TokenFamilyTraceResult
} from '../scenario/types.js';
import type { TokenScenarioAnalyzer } from '../scenario/TokenScenarioAnalyzer.js';
import { confidence, extractUrlFields, targetMatches, uniqueStrings } from '../scenario/normalization.js';
import type { TaskManifestManager } from '../task/TaskManifestManager.js';
import type { PureExtractionRunner } from '../workflow/PureExtractionRunner.js';
import type { RebuildWorkflowRunner } from '../workflow/RebuildWorkflowRunner.js';
import type {
  DependencyWindowInput,
  DependencyWindowNode,
  DependencyWindowOutput,
  DependencyWindowResult,
  DependencyWindowSnippet
} from './types.js';
import {
  classifyNodeKind,
  detectExcludedNoise,
  extractAssignments,
  extractFunctionParams,
  extractNearbySymbols,
  findTargetSnippets,
  FRESHNESS_NAME_PATTERN,
  makeWindowId,
  OUTPUT_NAME_PATTERN,
  SIGNAL_NAME_PATTERN
} from './WindowHeuristics.js';

type WindowSource = 'helper-boundary-last' | 'scenario-last' | 'capture-last' | 'task-artifact';

interface DependencyWindowExtractorDeps {
  codeCollector: CodeCollector;
  cryptoHelperLocator: CryptoHelperLocator;
  evidenceStore: EvidenceStore;
  helperBoundaryExtractor: HelperBoundaryExtractor;
  helperBoundaryRegistry: HelperBoundaryRegistry;
  pureExtractionRunner: PureExtractionRunner;
  rebuildWorkflowRunner: RebuildWorkflowRunner;
  replayRecipeRunner: ReplayRecipeRunner;
  requestSinkLocator: RequestSinkLocator;
  scenarioWorkflowRunner: ScenarioWorkflowRunner;
  signatureScenarioAnalyzer: SignatureScenarioAnalyzer;
  taskManifestManager: TaskManifestManager;
  tokenScenarioAnalyzer: TokenScenarioAnalyzer;
}

interface WindowContext {
  boundary: HelperBoundaryResult | null;
  capture: ReplayRecipeResult | null;
  scenario: ScenarioWorkflowResult | null;
  analysis: ScenarioAnalysisResult | null;
}

export class DependencyWindowExtractor {
  constructor(private readonly deps: DependencyWindowExtractorDeps) {}

  async extract(options: {
    targetName?: string;
    source?: WindowSource;
    taskId?: string;
    targetUrl?: string;
  } = {}): Promise<DependencyWindowResult> {
    const notes: string[] = [];
    const context = await this.readContext(options, notes);
    const target = await this.resolveTarget(options.targetName, context, notes);
    const codeFiles = this.readTopCodeFiles(notes);
    const snippets = findTargetSnippets(codeFiles, target.name);
    const tokenTrace = await this.readTokenTrace(options.targetUrl, notes);
    const sinkResult = await this.readSinkResult(options.targetUrl, notes);
    const helperResult = await this.readCryptoHelpers(notes);
    const files = this.collectFiles(snippets, codeFiles);
    const nodes = this.buildNodes({
      codeFiles,
      helperResult,
      sinkResult,
      snippets,
      target
    });
    const inputs = this.buildInputs({
      boundary: context.boundary,
      context,
      snippets,
      targetName: target.name,
      tokenTrace
    });
    const outputs = this.buildOutputs({
      boundary: context.boundary,
      context,
      snippets,
      targetName: target.name
    });
    const validationAnchors = this.buildValidationAnchors({
      boundary: context.boundary,
      capture: context.capture,
      analysis: context.analysis,
      sinkResult,
      tokenTrace
    });

    if (snippets.length === 0) {
      notes.push('No collected code snippet matched the target symbol; window relies on boundary/scenario/runtime evidence.');
    }
    if (!context.boundary) {
      notes.push('No helper boundary was available for this source; inputs and outputs are inferred from code/scenario evidence.');
    }

    return {
      excludedNoise: detectExcludedNoise(snippets, options.targetUrl),
      exportHints: this.buildExportHints(target.name, sinkResult, validationAnchors),
      files,
      inputs,
      nodes,
      notes: uniqueStrings(notes, 30),
      outputs,
      purePreflightHints: this.buildPurePreflightHints(target.name, inputs, outputs),
      rebuildPreflightHints: this.buildRebuildPreflightHints(target.name, inputs, outputs, validationAnchors),
      scenario: target.scenario,
      snippets,
      targetKind: target.kind,
      targetName: target.name,
      validationAnchors,
      windowId: makeWindowId(target.name)
    };
  }

  private async readContext(
    options: { source?: WindowSource; taskId?: string },
    notes: string[]
  ): Promise<WindowContext> {
    if (options.source === 'task-artifact' && !options.taskId) {
      throw new AppError(
        'TASK_ID_REQUIRED',
        'extract_dependency_window with source=task-artifact requires taskId.'
      );
    }

    const context: WindowContext = {
      analysis: null,
      boundary: null,
      capture: null,
      scenario: null
    };

    if (options.taskId && (options.source === undefined || options.source === 'task-artifact')) {
      context.boundary = await this.readBoundarySnapshot(options.taskId, notes);
      context.capture = await this.readSnapshot<ReplayRecipeResult>(options.taskId, 'scenario/capture/result', this.isReplayRecipeResult, notes);
      context.scenario = await this.readSnapshot<ScenarioWorkflowResult>(options.taskId, 'scenario/workflow', this.isScenarioWorkflowResult, notes);
      context.analysis = await this.readSnapshot<ScenarioAnalysisResult>(options.taskId, 'scenario/analysis', this.isScenarioAnalysisResult, notes);
      if (!context.analysis) {
        context.analysis = context.scenario?.analysis ?? context.capture?.scenarioResult ?? null;
      }
      if (context.boundary || context.capture || context.scenario || context.analysis || options.source === 'task-artifact') {
        return context;
      }
      notes.push('taskId was provided, but dependency-window source artifacts were not found; falling back to runtime caches.');
    }

    if (options.source === 'helper-boundary-last') {
      context.boundary = this.deps.helperBoundaryRegistry.getLast();
      notes.push('Using helper-boundary-last source: scenario and capture runtime caches are intentionally ignored.');
      return context;
    }

    if (options.source === 'scenario-last') {
      context.scenario = this.deps.scenarioWorkflowRunner.getLastScenarioWorkflowResult();
      context.analysis = context.scenario?.analysis ?? null;
      notes.push('Using scenario-last source: helper boundary and capture runtime caches are intentionally ignored.');
      return context;
    }

    if (options.source === 'capture-last') {
      context.capture = this.deps.replayRecipeRunner.getLastReplayRecipeResult();
      context.analysis = context.capture?.scenarioResult ?? null;
      notes.push('Using capture-last source: helper boundary and scenario workflow caches are intentionally ignored.');
      return context;
    }

    context.boundary = this.deps.helperBoundaryRegistry.getLast();
    context.capture = this.deps.replayRecipeRunner.getLastReplayRecipeResult();
    context.scenario = this.deps.scenarioWorkflowRunner.getLastScenarioWorkflowResult();
    context.analysis = context.scenario?.analysis ?? context.capture?.scenarioResult ?? null;
    return context;
  }

  private async resolveTarget(
    explicitTargetName: string | undefined,
    context: WindowContext,
    notes: string[]
  ): Promise<{ name: string; kind: 'helper' | 'function'; scenario?: string; confidence: number; file?: string }> {
    const scenario = context.analysis?.scenario ?? context.scenario?.preset.scenario ?? context.capture?.preset.scenario;

    if (explicitTargetName) {
      return {
        confidence: 0.9,
        kind: context.boundary?.helperName === explicitTargetName ? 'helper' : 'function',
        name: explicitTargetName,
        scenario
      };
    }

    if (context.boundary) {
      notes.push('Selected target from latest helper boundary.');
      return {
        confidence: context.boundary.confidence,
        file: context.boundary.file,
        kind: 'helper',
        name: context.boundary.helperName,
        scenario
      };
    }

    const scenarioHelper = context.scenario?.helperResult?.helpers.find((helper) => !helper.name.startsWith('crypto:')) ??
      context.scenario?.helperResult?.helpers[0];
    if (scenarioHelper) {
      notes.push('Selected target from scenario helper result.');
      return {
        confidence: scenarioHelper.confidence,
        file: scenarioHelper.file,
        kind: 'helper',
        name: scenarioHelper.name,
        scenario
      };
    }

    const priorityTarget = context.analysis?.priorityTargets.find((target) => target.kind === 'helper' || target.kind === 'function');
    if (priorityTarget) {
      notes.push('Selected target from scenario priority target.');
      return {
        confidence: Math.min(0.88, priorityTarget.score / 100),
        kind: priorityTarget.kind === 'helper' ? 'helper' : 'function',
        name: priorityTarget.target,
        scenario
      };
    }

    const candidateFunction = context.analysis?.candidateFunctions.find((name) => SIGNAL_NAME_PATTERN.test(name)) ??
      context.analysis?.candidateFunctions[0];
    if (candidateFunction) {
      notes.push('Selected target from scenario candidate functions.');
      return {
        confidence: 0.66,
        kind: 'function',
        name: candidateFunction,
        scenario
      };
    }

    const helperResult = await this.deps.cryptoHelperLocator.locate({ topN: 8 });
    const helper = helperResult.helpers.find((item) => !item.name.startsWith('crypto:')) ?? helperResult.helpers[0];
    if (helper) {
      notes.push('Selected target from crypto helper locator fallback.');
      return {
        confidence: helper.confidence,
        file: helper.file,
        kind: 'helper',
        name: helper.name,
        scenario
      };
    }

    notes.push('No function/helper target evidence was available; using unknown-target placeholder.');
    return {
      confidence: 0.2,
      kind: 'function',
      name: 'unknown-target',
      scenario
    };
  }

  private readTopCodeFiles(notes: string[]): RankedCodeFile[] {
    try {
      return this.deps.codeCollector.getTopPriorityFiles(12).files;
    } catch (error) {
      notes.push(`Unable to read top-priority code files: ${this.toMessage(error)}`);
      return [];
    }
  }

  private async readTokenTrace(targetUrl: string | undefined, notes: string[]): Promise<TokenFamilyTraceResult | null> {
    try {
      return await this.deps.tokenScenarioAnalyzer.trace({ targetUrl });
    } catch (error) {
      notes.push(`Unable to trace token family for dependency window: ${this.toMessage(error)}`);
      return null;
    }
  }

  private async readSinkResult(targetUrl: string | undefined, notes: string[]): Promise<RequestSinkResult | null> {
    try {
      return await this.deps.requestSinkLocator.locate({ targetUrl, topN: 8 });
    } catch (error) {
      notes.push(`Unable to locate request sink for dependency window: ${this.toMessage(error)}`);
      return null;
    }
  }

  private async readCryptoHelpers(notes: string[]): Promise<CryptoHelperResult | null> {
    try {
      return await this.deps.cryptoHelperLocator.locate({ topN: 8 });
    } catch (error) {
      notes.push(`Unable to locate crypto helpers for dependency window: ${this.toMessage(error)}`);
      return null;
    }
  }

  private collectFiles(snippets: readonly DependencyWindowSnippet[], files: readonly RankedCodeFile[]): string[] {
    const fromSnippets = snippets.map((snippet) => snippet.file);
    return uniqueStrings(fromSnippets.length > 0 ? fromSnippets : files.slice(0, 4).map((file) => file.url), 12);
  }

  private buildNodes(input: {
    codeFiles: readonly RankedCodeFile[];
    helperResult: CryptoHelperResult | null;
    sinkResult: RequestSinkResult | null;
    snippets: readonly DependencyWindowSnippet[];
    target: { name: string; kind: 'helper' | 'function'; confidence: number; file?: string };
  }): DependencyWindowNode[] {
    const values: DependencyWindowNode[] = [{
      confidence: confidence(input.target.confidence),
      file: input.target.file,
      kind: input.target.kind,
      name: input.target.name,
      reason: 'selected target for minimal dependency window'
    }];

    for (const symbol of extractNearbySymbols(input.snippets)) {
      values.push({
        confidence: symbol.kind === 'request-sink' ? 0.82 : SIGNAL_NAME_PATTERN.test(symbol.name) ? 0.76 : 0.58,
        file: symbol.file,
        kind: symbol.kind,
        name: symbol.name,
        reason: symbol.reason
      });
    }

    for (const sink of input.sinkResult?.sinks.slice(0, 5) ?? []) {
      values.push({
        confidence: confidence(Math.min(0.9, sink.score / 100)),
        kind: 'request-sink',
        name: sink.sink,
        reason: sink.reasons[0] ?? 'request sink locator promoted this sink'
      });
    }

    for (const helper of input.helperResult?.helpers.slice(0, 6) ?? []) {
      values.push({
        confidence: helper.confidence,
        file: helper.file,
        kind: 'helper',
        name: helper.name,
        reason: helper.reasons[0] ?? 'crypto helper locator promoted this helper'
      });
    }

    const seen = new Set<string>();
    return values
      .filter((node) => {
        const key = `${node.kind}:${node.file ?? ''}:${node.name}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .sort((left, right) => right.confidence - left.confidence || left.name.localeCompare(right.name))
      .slice(0, 30);
  }

  private buildInputs(input: {
    boundary: HelperBoundaryResult | null;
    context: WindowContext;
    snippets: readonly DependencyWindowSnippet[];
    targetName: string;
    tokenTrace: TokenFamilyTraceResult | null;
  }): DependencyWindowInput[] {
    const values: DependencyWindowInput[] = [];

    for (const item of input.boundary?.inputs ?? []) {
      values.push({
        confidence: item.confidence,
        name: item.name,
        preserveAsExternal: true,
        reason: `helper boundary input: ${item.reason}`,
        source: item.source
      });
    }

    for (const param of extractFunctionParams(input.snippets, input.targetName)) {
      values.push({
        confidence: SIGNAL_NAME_PATTERN.test(param) ? 0.82 : 0.62,
        name: param,
        preserveAsExternal: true,
        reason: 'target function parameter in dependency window',
        source: 'param'
      });
    }

    for (const binding of input.tokenTrace?.requestBindings ?? []) {
      values.push({
        confidence: 0.78,
        name: binding.param,
        preserveAsExternal: true,
        reason: `token family binding appears on ${binding.method} ${binding.url}`,
        source: 'token-family'
      });
    }

    for (const field of this.collectRequestFields(input.context)) {
      if (!SIGNAL_NAME_PATTERN.test(field.name)) {
        continue;
      }
      values.push({
        confidence: field.source === 'header' ? 0.76 : 0.7,
        name: field.name,
        preserveAsExternal: true,
        reason: `request ${field.source} matches scenario input family`,
        source: field.source === 'url' ? 'param' : field.source
      });
    }

    return this.dedupeInputs(values).slice(0, 30);
  }

  private buildOutputs(input: {
    boundary: HelperBoundaryResult | null;
    context: WindowContext;
    snippets: readonly DependencyWindowSnippet[];
    targetName: string;
  }): DependencyWindowOutput[] {
    const values: DependencyWindowOutput[] = [];

    for (const item of input.boundary?.outputs ?? []) {
      values.push({
        confidence: item.confidence,
        name: item.name,
        reason: `helper boundary output: ${item.reason}`,
        target: item.target
      });
    }

    for (const assignment of extractAssignments(input.snippets, input.targetName)) {
      values.push({
        confidence: OUTPUT_NAME_PATTERN.test(assignment) ? 0.82 : 0.58,
        name: assignment,
        reason: 'assignment receives target call result inside dependency window',
        target: OUTPUT_NAME_PATTERN.test(assignment) ? 'request-param' : 'intermediate'
      });
    }

    if (input.snippets.some((snippet) => /\breturn\b/.test(snippet.preview))) {
      values.push({
        confidence: 0.62,
        name: 'return',
        reason: 'target window contains a return path',
        target: 'return'
      });
    }

    for (const field of this.collectRequestFields(input.context)) {
      if (!OUTPUT_NAME_PATTERN.test(field.name)) {
        continue;
      }
      values.push({
        confidence: field.source === 'header' ? 0.82 : 0.76,
        name: field.name,
        reason: `request ${field.source} is a likely validation output`,
        target: field.source === 'header' ? 'header' : field.source === 'body-field' ? 'body-field' : 'request-param'
      });
    }

    return this.dedupeOutputs(values).slice(0, 30);
  }

  private buildValidationAnchors(input: {
    boundary: HelperBoundaryResult | null;
    capture: ReplayRecipeResult | null;
    analysis: ScenarioAnalysisResult | null;
    sinkResult: RequestSinkResult | null;
    tokenTrace: TokenFamilyTraceResult | null;
  }): DependencyWindowResult['validationAnchors'] {
    const values: DependencyWindowResult['validationAnchors'] = [];

    for (const request of input.analysis?.suspiciousRequests.slice(0, 5) ?? []) {
      values.push({
        reason: `scenario suspicious score=${request.score} indicators=${request.indicators.join(', ') || 'none'}`,
        type: 'request',
        value: `${request.method.toUpperCase()} ${request.url}`
      });
    }

    for (const request of input.capture?.observedRequests.slice(0, 5) ?? []) {
      values.push({
        reason: 'observed during the latest replay capture window',
        type: 'request',
        value: `${request.method.toUpperCase()} ${request.url}`
      });
    }

    for (const request of input.boundary?.relatedRequests.slice(0, 5) ?? []) {
      values.push({
        reason: `helper boundary matched fields: ${request.matchedFields.join(', ') || 'none'}`,
        type: 'request',
        value: `${request.method.toUpperCase()} ${request.url}`
      });
    }

    if (input.sinkResult?.topSink) {
      values.push({
        reason: 'request sink locator top sink',
        type: 'sink',
        value: input.sinkResult.topSink
      });
    }

    for (const binding of input.tokenTrace?.requestBindings.slice(0, 8) ?? []) {
      values.push({
        reason: `token family request binding on ${binding.method}`,
        type: 'token-binding',
        value: `${binding.param} -> ${binding.method.toUpperCase()} ${binding.url}`
      });
    }

    for (const hook of input.boundary?.recommendedHooks.slice(0, 5) ?? []) {
      values.push({
        reason: 'helper boundary recommended hook',
        type: 'hook',
        value: hook
      });
    }

    return this.dedupeAnchors(values).slice(0, 30);
  }

  private buildExportHints(
    targetName: string,
    sinkResult: RequestSinkResult | null,
    anchors: DependencyWindowResult['validationAnchors']
  ): string[] {
    return uniqueStrings([
      `Export target ${targetName} with only the nearest dependency snippets first.`,
      'Keep token/nonce/timestamp/challenge/fingerprint inputs external; do not inline them as constants in the first probe.',
      anchors.find((anchor) => anchor.type === 'request') ? 'Carry the top request validation anchor into the rebuild fixture metadata.' : '',
      sinkResult?.topSink ? `If exporting sink-adjacent code, stop at the last hop before ${sinkResult.topSink}.` : '',
      'Prefer a probeable window over a large reconstructed bundle; expand only after helper I/O is stable.'
    ].filter(Boolean), 10);
  }

  private buildRebuildPreflightHints(
    targetName: string,
    inputs: readonly DependencyWindowInput[],
    outputs: readonly DependencyWindowOutput[],
    anchors: DependencyWindowResult['validationAnchors']
  ): string[] {
    const externalInputs = inputs.filter((input) => input.preserveAsExternal).map((input) => input.name).slice(0, 8);
    const outputsToCheck = outputs.map((output) => output.name).slice(0, 6);
    const requestAnchor = anchors.find((anchor) => anchor.type === 'request');
    return uniqueStrings([
      externalInputs.length > 0
        ? `Use ${externalInputs.join(', ')} as fixture input fields for the first rebuild probe.`
        : `Capture function args for ${targetName} before exporting a rebuild probe.`,
      outputsToCheck.length > 0
        ? `Compare first against output field(s): ${outputsToCheck.join(', ')}.`
        : 'Add a helper return assertion before request-level compare.',
      requestAnchor ? `Use request anchor ${requestAnchor.value} as the first request-level compare target.` : '',
      'Stub broad DOM/UI access first, but do not stub crypto, token, nonce, timestamp, or request field transforms.',
      'Exclude document/window/location/event/storage noise from the first dependency probe unless it appears as a named preserved input.'
    ].filter(Boolean), 10);
  }

  private buildPurePreflightHints(
    targetName: string,
    inputs: readonly DependencyWindowInput[],
    outputs: readonly DependencyWindowOutput[]
  ): string[] {
    const freshnessInputs = inputs.filter((input) => FRESHNESS_NAME_PATTERN.test(input.name)).map((input) => input.name).slice(0, 8);
    const expectedOutputs = outputs.filter((output) => output.target !== 'intermediate').map((output) => output.name).slice(0, 6);
    return uniqueStrings([
      freshnessInputs.length > 0
        ? `Freeze freshness inputs explicitly: ${freshnessInputs.join(', ')}.`
        : `Freeze observed args for ${targetName} before pure boundary generation.`,
      expectedOutputs.length > 0
        ? `Treat ${expectedOutputs.join(', ')} as explicit expected output(s).`
        : 'Validate helper return before expanding to request-level expected output.',
      'Keep runtime noise outside the pure boundary until a focused hook proves it affects helper output.',
      'Verify the minimal helper window in Node before promoting it to a pure workflow fixture.'
    ], 10);
  }

  private collectRequestFields(context: WindowContext): Array<{ name: string; source: 'url' | 'header' | 'body-field' }> {
    const values: Array<{ name: string; source: 'url' | 'header' | 'body-field' }> = [];
    for (const request of context.analysis?.suspiciousRequests ?? []) {
      values.push(...extractUrlFields(request.url));
      for (const indicator of request.indicators) {
        values.push({
          name: indicator,
          source: 'url'
        });
      }
    }
    for (const request of context.capture?.observedRequests ?? []) {
      values.push(...extractUrlFields(request.url));
    }
    for (const request of context.boundary?.relatedRequests ?? []) {
      for (const field of request.matchedFields) {
        values.push({
          name: field,
          source: 'url'
        });
      }
    }
    return values.filter((field) => targetMatches(field.name, undefined));
  }

  private dedupeInputs(values: readonly DependencyWindowInput[]): DependencyWindowInput[] {
    const byName = new Map<string, DependencyWindowInput>();
    for (const value of values) {
      const key = `${value.source}:${value.name.toLowerCase()}`;
      const existing = byName.get(key);
      if (!existing || value.confidence > existing.confidence) {
        byName.set(key, value);
      }
    }
    return Array.from(byName.values()).sort((left, right) => right.confidence - left.confidence || left.name.localeCompare(right.name));
  }

  private dedupeOutputs(values: readonly DependencyWindowOutput[]): DependencyWindowOutput[] {
    const byName = new Map<string, DependencyWindowOutput>();
    for (const value of values) {
      const key = `${value.target}:${value.name.toLowerCase()}`;
      const existing = byName.get(key);
      if (!existing || value.confidence > existing.confidence) {
        byName.set(key, value);
      }
    }
    return Array.from(byName.values()).sort((left, right) => right.confidence - left.confidence || left.name.localeCompare(right.name));
  }

  private dedupeAnchors(values: DependencyWindowResult['validationAnchors']): DependencyWindowResult['validationAnchors'] {
    const seen = new Set<string>();
    return values.filter((value) => {
      const key = `${value.type}:${value.value}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private async readBoundarySnapshot(taskId: string, notes: string[]): Promise<HelperBoundaryResult | null> {
    const stored = await this.readSnapshot<StoredHelperBoundary>(taskId, 'helper-boundary/latest', this.isStoredHelperBoundary, notes);
    return stored?.result ?? null;
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

  private isStoredHelperBoundary(value: unknown): value is StoredHelperBoundary {
    return Boolean(value && typeof value === 'object' && 'boundaryId' in value && 'result' in value);
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
