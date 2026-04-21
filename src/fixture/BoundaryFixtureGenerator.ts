import { AppError } from '../core/errors.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { HelperBoundaryExtractor } from '../helper/HelperBoundaryExtractor.js';
import type { HelperBoundaryRegistry } from '../helper/HelperBoundaryRegistry.js';
import type { HelperBoundaryResult, StoredHelperBoundary } from '../helper/types.js';
import type { StoredProbePlan, ProbePlan } from '../probe/types.js';
import type { ProbePlanRegistry } from '../probe/ProbePlanRegistry.js';
import type { ReplayRecipeRunner } from '../replay/ReplayRecipeRunner.js';
import type { ReplayRecipeResult } from '../replay/types.js';
import type { RequestSinkLocator } from '../scenario/RequestSinkLocator.js';
import type { ScenarioWorkflowRunner } from '../scenario/ScenarioWorkflowRunner.js';
import type { SignatureScenarioAnalyzer } from '../scenario/SignatureScenarioAnalyzer.js';
import type { ScenarioAnalysisResult, ScenarioWorkflowResult, TokenFamilyTraceResult } from '../scenario/types.js';
import type { TokenScenarioAnalyzer } from '../scenario/TokenScenarioAnalyzer.js';
import { confidence, extractUrlFields, uniqueStrings } from '../scenario/normalization.js';
import type { TaskManifestManager } from '../task/TaskManifestManager.js';
import type { DependencyWindowExtractor } from '../window/DependencyWindowExtractor.js';
import type { DependencyWindowRegistry } from '../window/DependencyWindowRegistry.js';
import type { DependencyWindowResult, StoredDependencyWindow } from '../window/types.js';
import { FRESHNESS_NAME_PATTERN, OUTPUT_NAME_PATTERN, SIGNAL_NAME_PATTERN } from '../window/WindowHeuristics.js';
import type { PureExtractionRunner } from '../workflow/PureExtractionRunner.js';
import type { RebuildWorkflowRunner } from '../workflow/RebuildWorkflowRunner.js';
import type { FixtureCandidateResult, FixtureExpectedOutput, FixtureField } from './types.js';

type FixtureSource = 'window-last' | 'probe-last' | 'helper-boundary-last' | 'task-artifact';

interface BoundaryFixtureGeneratorDeps {
  dependencyWindowExtractor: DependencyWindowExtractor;
  dependencyWindowRegistry: DependencyWindowRegistry;
  evidenceStore: EvidenceStore;
  helperBoundaryExtractor: HelperBoundaryExtractor;
  helperBoundaryRegistry: HelperBoundaryRegistry;
  probePlanRegistry: ProbePlanRegistry;
  pureExtractionRunner: PureExtractionRunner;
  rebuildWorkflowRunner: RebuildWorkflowRunner;
  replayRecipeRunner: ReplayRecipeRunner;
  requestSinkLocator: RequestSinkLocator;
  scenarioWorkflowRunner: ScenarioWorkflowRunner;
  signatureScenarioAnalyzer: SignatureScenarioAnalyzer;
  taskManifestManager: TaskManifestManager;
  tokenScenarioAnalyzer: TokenScenarioAnalyzer;
}

interface FixtureContext {
  boundary: HelperBoundaryResult | null;
  window: DependencyWindowResult | null;
  probe: ProbePlan | null;
  capture: ReplayRecipeResult | null;
  scenario: ScenarioWorkflowResult | null;
  analysis: ScenarioAnalysisResult | null;
}

export class BoundaryFixtureGenerator {
  constructor(private readonly deps: BoundaryFixtureGeneratorDeps) {}

  async generate(options: {
    targetName?: string;
    source?: FixtureSource;
    taskId?: string;
    targetUrl?: string;
  } = {}): Promise<FixtureCandidateResult> {
    const notes: string[] = [];
    const context = await this.readContext(options, notes);
    const targetName = this.resolveTargetName(options.targetName, context, notes);
    const scenario = context.window?.scenario ??
      context.probe?.scenario ??
      context.analysis?.scenario ??
      context.scenario?.preset.scenario ??
      context.capture?.preset.scenario;
    const tokenTrace = await this.readTokenTrace(options.targetUrl, notes);

    const validationAnchors = this.buildValidationAnchors(context, tokenTrace);
    const inputs = this.buildInputs(context, tokenTrace);
    const expectedOutputs = this.buildExpectedOutputs(context);
    const excludedNoise = this.buildExcludedNoise(context);

    if (inputs.length === 0) {
      notes.push('No named fixture inputs were inferred; run focused helper hooks before using this candidate in rebuild.');
    }
    if (expectedOutputs.length === 0) {
      notes.push('No expected output was inferred; helper return should be captured before this fixture is promoted.');
    }

    return {
      basedOn: {
        captureResult: Boolean(context.capture),
        dependencyWindow: Boolean(context.window),
        helperBoundary: Boolean(context.boundary),
        probePlan: Boolean(context.probe),
        scenarioWorkflow: Boolean(context.scenario || context.analysis)
      },
      excludedNoise,
      expectedOutputs,
      fixtureId: makeFixtureId(targetName),
      inputs,
      notes: uniqueStrings(notes, 30),
      pureUsageHints: this.buildPureUsageHints(targetName, inputs, expectedOutputs, excludedNoise),
      rebuildUsageHints: this.buildRebuildUsageHints(targetName, inputs, expectedOutputs, validationAnchors),
      scenario,
      targetName,
      validationAnchors
    };
  }

  private async readContext(
    options: { source?: FixtureSource; taskId?: string },
    notes: string[]
  ): Promise<FixtureContext> {
    if (options.source === 'task-artifact' && !options.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'generate_boundary_fixture with source=task-artifact requires taskId.');
    }

    const context: FixtureContext = {
      analysis: null,
      boundary: null,
      capture: null,
      probe: null,
      scenario: null,
      window: null
    };

    if (options.taskId && (options.source === undefined || options.source === 'task-artifact')) {
      context.window = await this.readWindowSnapshot(options.taskId, notes);
      context.boundary = await this.readBoundarySnapshot(options.taskId, notes);
      context.probe = await this.readProbeSnapshot(options.taskId, notes);
      context.capture = await this.readSnapshot<ReplayRecipeResult>(options.taskId, 'scenario/capture/result', this.isReplayRecipeResult, notes);
      context.scenario = await this.readSnapshot<ScenarioWorkflowResult>(options.taskId, 'scenario/workflow', this.isScenarioWorkflowResult, notes);
      context.analysis = await this.readSnapshot<ScenarioAnalysisResult>(options.taskId, 'scenario/analysis', this.isScenarioAnalysisResult, notes);
      if (!context.analysis) {
        context.analysis = context.scenario?.analysis ?? context.capture?.scenarioResult ?? null;
      }
      if (context.window || context.boundary || context.probe || context.capture || context.scenario || context.analysis || options.source === 'task-artifact') {
        return context;
      }
      notes.push('taskId was provided, but fixture source artifacts were not found; falling back to runtime caches.');
    }

    if (options.source === 'window-last') {
      context.window = this.deps.dependencyWindowRegistry.getLast();
      notes.push('Using window-last source: helper/probe/scenario/capture runtime caches are intentionally ignored.');
      return context;
    }

    if (options.source === 'probe-last') {
      context.probe = this.deps.probePlanRegistry.getLast();
      notes.push('Using probe-last source: window/helper/scenario/capture runtime caches are intentionally ignored.');
      return context;
    }

    if (options.source === 'helper-boundary-last') {
      context.boundary = this.deps.helperBoundaryRegistry.getLast();
      notes.push('Using helper-boundary-last source: window/probe/scenario/capture runtime caches are intentionally ignored.');
      return context;
    }

    context.window = this.deps.dependencyWindowRegistry.getLast();
    context.boundary = this.deps.helperBoundaryRegistry.getLast();
    context.probe = this.deps.probePlanRegistry.getLast();
    context.capture = this.deps.replayRecipeRunner.getLastReplayRecipeResult();
    context.scenario = this.deps.scenarioWorkflowRunner.getLastScenarioWorkflowResult();
    context.analysis = context.scenario?.analysis ?? context.capture?.scenarioResult ?? null;
    return context;
  }

  private resolveTargetName(explicitTargetName: string | undefined, context: FixtureContext, notes: string[]): string {
    if (explicitTargetName) {
      return explicitTargetName;
    }
    if (context.window?.targetName) {
      notes.push('Selected fixture target from dependency window.');
      return context.window.targetName;
    }
    if (context.probe?.targetName) {
      notes.push('Selected fixture target from probe plan.');
      return context.probe.targetName;
    }
    if (context.boundary?.helperName) {
      notes.push('Selected fixture target from helper boundary.');
      return context.boundary.helperName;
    }
    const priority = context.analysis?.priorityTargets.find((target) => target.kind === 'helper' || target.kind === 'function') ??
      context.analysis?.priorityTargets[0];
    if (priority) {
      notes.push('Selected fixture target from scenario priority target.');
      return priority.target;
    }
    notes.push('No fixture target evidence was available; using unknown-fixture-target placeholder.');
    return 'unknown-fixture-target';
  }

  private buildInputs(context: FixtureContext, tokenTrace: TokenFamilyTraceResult | null): FixtureField[] {
    const values: FixtureField[] = [];

    for (const input of context.boundary?.inputs ?? []) {
      values.push({
        confidence: input.confidence,
        name: input.name,
        preserveFreshness: FRESHNESS_NAME_PATTERN.test(input.name),
        reason: `helper boundary input: ${input.reason}`,
        required: true,
        source: 'boundary-input'
      });
    }

    for (const input of context.window?.inputs ?? []) {
      values.push({
        confidence: input.confidence,
        name: input.name,
        preserveFreshness: input.preserveAsExternal || FRESHNESS_NAME_PATTERN.test(input.name),
        reason: `dependency window input: ${input.reason}`,
        required: input.preserveAsExternal,
        source: input.source === 'token-family' ? 'token-binding' : 'window-input'
      });
    }

    for (const binding of tokenTrace?.requestBindings ?? []) {
      values.push({
        confidence: 0.78,
        name: binding.param,
        preserveFreshness: true,
        reason: `token family request binding on ${binding.method} ${binding.url}`,
        required: true,
        source: 'token-binding'
      });
    }

    for (const anchor of context.window?.validationAnchors ?? []) {
      const parsed = parseFieldAnchor(anchor.value);
      if (!parsed || !SIGNAL_NAME_PATTERN.test(parsed.name)) {
        continue;
      }
      values.push({
        confidence: parsed.source === 'header' ? 0.76 : 0.7,
        name: parsed.name,
        preserveFreshness: FRESHNESS_NAME_PATTERN.test(parsed.name),
        reason: `validation anchor request field: ${anchor.reason}`,
        required: true,
        source: parsed.source === 'token-binding' ? 'token-binding' : 'request-field'
      });
    }

    for (const request of context.analysis?.suspiciousRequests ?? []) {
      for (const indicator of request.indicators) {
        if (!SIGNAL_NAME_PATTERN.test(indicator)) {
          continue;
        }
        values.push({
          confidence: 0.66,
          name: indicator,
          preserveFreshness: FRESHNESS_NAME_PATTERN.test(indicator),
          reason: `scenario suspicious request indicator on ${request.method} ${request.url}`,
          required: true,
          source: 'request-field'
        });
      }
      for (const field of extractUrlFields(request.url)) {
        if (!SIGNAL_NAME_PATTERN.test(field.name)) {
          continue;
        }
        values.push({
          confidence: 0.64,
          name: field.name,
          preserveFreshness: FRESHNESS_NAME_PATTERN.test(field.name),
          reason: `scenario suspicious request query field on ${request.method} ${request.url}`,
          required: true,
          source: 'request-field'
        });
      }
    }

    for (const name of extractHintNames(context.probe?.fixtureHints ?? [])) {
      values.push({
        confidence: FRESHNESS_NAME_PATTERN.test(name) ? 0.66 : 0.54,
        name,
        preserveFreshness: FRESHNESS_NAME_PATTERN.test(name),
        reason: 'probe plan fixture hint mentions this field',
        required: SIGNAL_NAME_PATTERN.test(name),
        source: SIGNAL_NAME_PATTERN.test(name) ? 'request-field' : 'unknown'
      });
    }

    return dedupeFields(values).slice(0, 40);
  }

  private buildExpectedOutputs(context: FixtureContext): FixtureExpectedOutput[] {
    const values: FixtureExpectedOutput[] = [];

    for (const output of context.boundary?.outputs ?? []) {
      values.push({
        confidence: output.confidence,
        name: output.name,
        reason: `helper boundary output: ${output.reason}`,
        target: output.target === 'return'
          ? 'helper-return'
          : output.target === 'header'
            ? 'header'
            : output.target === 'body-field'
              ? 'body-field'
              : output.target === 'request-param'
                ? 'request-param'
                : 'unknown'
      });
    }

    for (const output of context.window?.outputs ?? []) {
      values.push({
        confidence: output.confidence,
        name: output.name,
        reason: `dependency window output: ${output.reason}`,
        target: output.target === 'return'
          ? 'helper-return'
          : output.target === 'header'
            ? 'header'
            : output.target === 'body-field'
              ? 'body-field'
              : output.target === 'request-param'
                ? 'request-param'
                : 'unknown'
      });
    }

    for (const name of extractHintNames(context.probe?.validationChecks ?? []).filter((item) => OUTPUT_NAME_PATTERN.test(item))) {
      values.push({
        confidence: 0.58,
        name,
        reason: 'probe plan validation check mentions this output field',
        target: name.toLowerCase().includes('header') || name.toLowerCase().includes('authorization') ? 'header' : 'request-param'
      });
    }

    if (values.length === 0 && (context.boundary || context.window || context.probe)) {
      values.push({
        confidence: 0.45,
        name: 'return',
        reason: 'no request-bound output was explicit; helper return is the smallest expected output',
        target: 'helper-return'
      });
    }

    return dedupeOutputs(values).slice(0, 30);
  }

  private buildValidationAnchors(
    context: FixtureContext,
    tokenTrace: TokenFamilyTraceResult | null
  ): FixtureCandidateResult['validationAnchors'] {
    const values: FixtureCandidateResult['validationAnchors'] = [];
    values.push(...context.window?.validationAnchors ?? []);
    for (const request of context.capture?.observedRequests.slice(0, 5) ?? []) {
      values.push({
        reason: 'observed during latest replay capture',
        type: 'request',
        value: `${request.method.toUpperCase()} ${request.url}`
      });
    }
    for (const request of context.analysis?.suspiciousRequests.slice(0, 5) ?? []) {
      values.push({
        reason: `scenario suspicious score=${request.score}`,
        type: 'request',
        value: `${request.method.toUpperCase()} ${request.url}`
      });
    }
    for (const hook of context.boundary?.recommendedHooks.slice(0, 6) ?? []) {
      values.push({
        reason: 'helper boundary recommended hook',
        type: 'hook',
        value: hook
      });
    }
    for (const binding of tokenTrace?.requestBindings.slice(0, 8) ?? []) {
      values.push({
        reason: `token family binding on ${binding.method}`,
        type: 'token-binding',
        value: `${binding.param} -> ${binding.method.toUpperCase()} ${binding.url}`
      });
    }

    return dedupeAnchors(values).slice(0, 30);
  }

  private buildExcludedNoise(context: FixtureContext): string[] {
    return uniqueStrings([
      ...context.window?.excludedNoise ?? [],
      'Exclude document/window/location/event objects from the smallest fixture unless named as explicit inputs.',
      'Exclude broad DOM/UI state and replay action metadata from the first rebuild fixture.',
      'Exclude storage/cache/logging/debugger noise unless it is bound to a preserved token/sign input.',
      'Ignore non-target request noise while validating this fixture candidate.'
    ], 20);
  }

  private buildRebuildUsageHints(
    targetName: string,
    inputs: readonly FixtureField[],
    outputs: readonly FixtureExpectedOutput[],
    anchors: FixtureCandidateResult['validationAnchors']
  ): string[] {
    const required = inputs.filter((input) => input.required).map((input) => input.name).slice(0, 10);
    const freshness = inputs.filter((input) => input.preserveFreshness).map((input) => input.name).slice(0, 8);
    const outputNames = outputs.map((output) => output.name).slice(0, 8);
    const requestAnchor = anchors.find((anchor) => anchor.type === 'request');
    return uniqueStrings([
      required.length > 0 ? `Put ${required.join(', ')} into the rebuild fixture inputs first.` : `Capture args for ${targetName} before rebuild export.`,
      freshness.length > 0 ? `Do not constant-fold freshness fields: ${freshness.join(', ')}.` : 'Keep new token/nonce/timestamp fields external if they appear during probe.',
      outputNames.length > 0 ? `Compare first expected output(s): ${outputNames.join(', ')}.` : 'Compare helper return before request-level response behavior.',
      requestAnchor ? `Use ${requestAnchor.value} as the request compare anchor after helper-level output matches.` : '',
      'Stub broad browser environment only after fixture inputs and helper output are stable.'
    ].filter(Boolean), 12);
  }

  private buildPureUsageHints(
    targetName: string,
    inputs: readonly FixtureField[],
    outputs: readonly FixtureExpectedOutput[],
    excludedNoise: readonly string[]
  ): string[] {
    const frozen = inputs.filter((input) => input.required || input.preserveFreshness).map((input) => input.name).slice(0, 10);
    const helperReturn = outputs.find((output) => output.target === 'helper-return');
    const requestOutputs = outputs.filter((output) => output.target !== 'helper-return').map((output) => output.name).slice(0, 8);
    return uniqueStrings([
      frozen.length > 0 ? `Freeze fixture inputs for pure preflight: ${frozen.join(', ')}.` : `Capture and freeze args for ${targetName}.`,
      helperReturn ? 'Validate helper return before expanding pure expected output to request-level fields.' : '',
      requestOutputs.length > 0 ? `After helper return matches, promote request-level expected output(s): ${requestOutputs.join(', ')}.` : '',
      excludedNoise.length > 0 ? 'Carry excluded runtime noise into pure boundary exclusions.' : '',
      'Do not start pure workflow until rebuild probe can reproduce the fixture expected output.'
    ].filter(Boolean), 12);
  }

  private async readTokenTrace(targetUrl: string | undefined, notes: string[]): Promise<TokenFamilyTraceResult | null> {
    try {
      return await this.deps.tokenScenarioAnalyzer.trace({ targetUrl });
    } catch (error) {
      notes.push(`Unable to trace token family for fixture candidate: ${this.toMessage(error)}`);
      return null;
    }
  }

  private async readWindowSnapshot(taskId: string, notes: string[]): Promise<DependencyWindowResult | null> {
    const stored = await this.readSnapshot<StoredDependencyWindow>(taskId, 'dependency-window/latest', this.isStoredDependencyWindow, notes);
    return stored?.result ?? null;
  }

  private async readBoundarySnapshot(taskId: string, notes: string[]): Promise<HelperBoundaryResult | null> {
    const stored = await this.readSnapshot<StoredHelperBoundary>(taskId, 'helper-boundary/latest', this.isStoredHelperBoundary, notes);
    return stored?.result ?? null;
  }

  private async readProbeSnapshot(taskId: string, notes: string[]): Promise<ProbePlan | null> {
    const stored = await this.readSnapshot<StoredProbePlan>(taskId, 'scenario-probe/latest', this.isStoredProbePlan, notes);
    return stored?.result ?? null;
  }

  private async readSnapshot<T>(taskId: string, name: string, guard: (value: unknown) => value is T, notes: string[]): Promise<T | null> {
    try {
      const snapshot = await this.deps.evidenceStore.readSnapshot(taskId, name);
      return guard(snapshot) ? snapshot : null;
    } catch (error) {
      notes.push(`Unable to read task snapshot ${name}: ${this.toMessage(error)}`);
      return null;
    }
  }

  private isStoredDependencyWindow(value: unknown): value is StoredDependencyWindow {
    return Boolean(value && typeof value === 'object' && 'windowId' in value && 'result' in value);
  }

  private isStoredHelperBoundary(value: unknown): value is StoredHelperBoundary {
    return Boolean(value && typeof value === 'object' && 'boundaryId' in value && 'result' in value);
  }

  private isStoredProbePlan(value: unknown): value is StoredProbePlan {
    return Boolean(value && typeof value === 'object' && 'planId' in value && 'result' in value);
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

function makeFixtureId(targetName: string): string {
  const safeName = targetName.replace(/[^A-Za-z0-9_$.-]+/g, '-').slice(0, 80) || 'fixture';
  return `${safeName}-${Date.now().toString(36)}`;
}

function parseFieldAnchor(value: string): { source: 'header' | 'body-field' | 'request-field' | 'token-binding'; name: string } | null {
  const match = value.match(/\b(header|body-field|url|token-binding):([^,\s]+)/i);
  if (!match?.[2]) {
    const binding = value.match(/^([A-Za-z_$][\w$.-]*)\s*->/);
    return binding?.[1] ? { name: binding[1], source: 'token-binding' } : null;
  }
  return {
    name: match[2],
    source: match[1] === 'header' ? 'header' : match[1] === 'body-field' ? 'body-field' : 'request-field'
  };
}

function extractHintNames(values: readonly string[]): string[] {
  const output: string[] = [];
  for (const value of values) {
    const afterColon = value.includes(':') ? value.split(':').slice(1).join(':') : value;
    for (const match of afterColon.matchAll(/\b[A-Za-z_$][\w$.-]{1,60}\b/g)) {
      if (match[0] && !STOP_WORDS.has(match[0].toLowerCase())) {
        output.push(match[0]);
      }
    }
  }
  return uniqueStrings(output, 30);
}

function dedupeFields(values: readonly FixtureField[]): FixtureField[] {
  const byKey = new Map<string, FixtureField>();
  for (const value of values) {
    const key = `${value.source}:${value.name.toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing || value.confidence > existing.confidence) {
      byKey.set(key, {
        ...value,
        confidence: confidence(value.confidence)
      });
    }
  }
  return Array.from(byKey.values()).sort((left, right) => right.confidence - left.confidence || left.name.localeCompare(right.name));
}

function dedupeOutputs(values: readonly FixtureExpectedOutput[]): FixtureExpectedOutput[] {
  const byKey = new Map<string, FixtureExpectedOutput>();
  for (const value of values) {
    const key = `${value.target}:${value.name.toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing || value.confidence > existing.confidence) {
      byKey.set(key, {
        ...value,
        confidence: confidence(value.confidence)
      });
    }
  }
  return Array.from(byKey.values()).sort((left, right) => right.confidence - left.confidence || left.name.localeCompare(right.name));
}

function dedupeAnchors(values: FixtureCandidateResult['validationAnchors']): FixtureCandidateResult['validationAnchors'] {
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

const STOP_WORDS = new Set([
  'fixture',
  'inputs',
  'include',
  'first',
  'expected',
  'output',
  'outputs',
  'helper',
  'request',
  'field',
  'fields',
  'should',
  'freeze',
  'keep',
  'external',
  'value',
  'values',
  'return',
  'against',
  'check',
  'compare'
]);
