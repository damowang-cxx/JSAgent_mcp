import { AppError } from '../core/errors.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { HelperBoundaryRegistry } from '../helper/HelperBoundaryRegistry.js';
import type { HelperBoundaryResult, StoredHelperBoundary } from '../helper/types.js';
import type { ReplayRecipeRunner } from '../replay/ReplayRecipeRunner.js';
import type { ReplayRecipeResult } from '../replay/types.js';
import type { ScenarioWorkflowRunner } from '../scenario/ScenarioWorkflowRunner.js';
import type { ScenarioAnalysisResult, ScenarioWorkflowResult } from '../scenario/types.js';
import type { DependencyWindowExtractor } from '../window/DependencyWindowExtractor.js';
import type { DependencyWindowRegistry } from '../window/DependencyWindowRegistry.js';
import type { DependencyWindowInput, DependencyWindowOutput, DependencyWindowResult, StoredDependencyWindow } from '../window/types.js';
import { FRESHNESS_NAME_PATTERN, makeProbePlanId, OUTPUT_NAME_PATTERN } from '../window/WindowHeuristics.js';
import type { ProbePlan, ProbeStep } from './types.js';

type ProbeSource = 'window-last' | 'helper-boundary-last' | 'scenario-last' | 'task-artifact';

interface ScenarioProbePlannerDeps {
  dependencyWindowExtractor: DependencyWindowExtractor;
  dependencyWindowRegistry: DependencyWindowRegistry;
  evidenceStore: EvidenceStore;
  helperBoundaryRegistry: HelperBoundaryRegistry;
  replayRecipeRunner: ReplayRecipeRunner;
  scenarioWorkflowRunner: ScenarioWorkflowRunner;
}

interface ProbeContext {
  window: DependencyWindowResult | null;
  boundary: HelperBoundaryResult | null;
  capture: ReplayRecipeResult | null;
  scenario: ScenarioWorkflowResult | null;
  analysis: ScenarioAnalysisResult | null;
}

export class ScenarioProbePlanner {
  constructor(private readonly deps: ScenarioProbePlannerDeps) {}

  async plan(options: {
    targetName?: string;
    source?: ProbeSource;
    taskId?: string;
    targetUrl?: string;
  } = {}): Promise<ProbePlan> {
    const notes: string[] = [];
    const context = await this.readContext(options, notes);
    const targetName = this.resolveTargetName(options.targetName, context, notes);
    const scenario = context.window?.scenario ??
      context.analysis?.scenario ??
      context.scenario?.preset.scenario ??
      context.capture?.preset.scenario;
    const basedOn = {
      captureResult: Boolean(context.capture),
      dependencyWindow: Boolean(context.window),
      helperBoundary: Boolean(context.boundary),
      scenarioWorkflow: Boolean(context.scenario || context.analysis)
    };

    const steps = this.buildSteps(targetName, context);
    const fixtureHints = this.buildFixtureHints(targetName, context);
    const hookHints = this.buildHookHints(targetName, context, options.targetUrl);
    const validationChecks = this.buildValidationChecks(targetName, context);
    const nextActions = this.buildNextActions(targetName, context);
    const stopIf = this.buildStopConditions(targetName, context);

    if (!context.window) {
      notes.push('No dependency window was available for this source; plan starts with boundary/scenario evidence and asks for a focused window next.');
    }
    if (!context.boundary) {
      notes.push('No helper boundary was available for this source; probe should confirm target args/return before rebuild.');
    }

    return {
      basedOn,
      fixtureHints,
      hookHints,
      nextActions,
      notes: uniqueStrings(notes, 30),
      planId: makeProbePlanId(targetName),
      priority: this.scorePriority(context),
      scenario,
      steps,
      stopIf,
      targetName,
      validationChecks
    };
  }

  private async readContext(
    options: { source?: ProbeSource; taskId?: string },
    notes: string[]
  ): Promise<ProbeContext> {
    if (options.source === 'task-artifact' && !options.taskId) {
      throw new AppError(
        'TASK_ID_REQUIRED',
        'plan_scenario_probe with source=task-artifact requires taskId.'
      );
    }

    const context: ProbeContext = {
      analysis: null,
      boundary: null,
      capture: null,
      scenario: null,
      window: null
    };

    if (options.taskId && (options.source === undefined || options.source === 'task-artifact')) {
      context.window = await this.readWindowSnapshot(options.taskId, notes);
      context.boundary = await this.readBoundarySnapshot(options.taskId, notes);
      context.capture = await this.readSnapshot<ReplayRecipeResult>(options.taskId, 'scenario/capture/result', this.isReplayRecipeResult, notes);
      context.scenario = await this.readSnapshot<ScenarioWorkflowResult>(options.taskId, 'scenario/workflow', this.isScenarioWorkflowResult, notes);
      context.analysis = await this.readSnapshot<ScenarioAnalysisResult>(options.taskId, 'scenario/analysis', this.isScenarioAnalysisResult, notes);
      if (!context.analysis) {
        context.analysis = context.window ? null : context.scenario?.analysis ?? context.capture?.scenarioResult ?? null;
      }
      if (context.window || context.boundary || context.capture || context.scenario || context.analysis || options.source === 'task-artifact') {
        return context;
      }
      notes.push('taskId was provided, but probe planning artifacts were not found; falling back to runtime caches.');
    }

    if (options.source === 'window-last') {
      context.window = this.deps.dependencyWindowRegistry.getLast();
      notes.push('Using window-last source: helper/scenario/capture runtime caches are intentionally ignored.');
      return context;
    }

    if (options.source === 'helper-boundary-last') {
      context.boundary = this.deps.helperBoundaryRegistry.getLast();
      notes.push('Using helper-boundary-last source: window/scenario/capture runtime caches are intentionally ignored.');
      return context;
    }

    if (options.source === 'scenario-last') {
      context.scenario = this.deps.scenarioWorkflowRunner.getLastScenarioWorkflowResult();
      context.analysis = context.scenario?.analysis ?? null;
      notes.push('Using scenario-last source: window/helper/capture runtime caches are intentionally ignored.');
      return context;
    }

    context.window = this.deps.dependencyWindowRegistry.getLast();
    context.boundary = this.deps.helperBoundaryRegistry.getLast();
    context.capture = this.deps.replayRecipeRunner.getLastReplayRecipeResult();
    context.scenario = this.deps.scenarioWorkflowRunner.getLastScenarioWorkflowResult();
    context.analysis = context.scenario?.analysis ?? context.capture?.scenarioResult ?? null;
    return context;
  }

  private resolveTargetName(explicitTargetName: string | undefined, context: ProbeContext, notes: string[]): string {
    if (explicitTargetName) {
      return explicitTargetName;
    }
    if (context.window?.targetName) {
      notes.push('Selected probe target from dependency window.');
      return context.window.targetName;
    }
    if (context.boundary?.helperName) {
      notes.push('Selected probe target from helper boundary.');
      return context.boundary.helperName;
    }
    const priorityTarget = context.analysis?.priorityTargets.find((target) => target.kind === 'helper' || target.kind === 'function') ??
      context.analysis?.priorityTargets[0];
    if (priorityTarget) {
      notes.push('Selected probe target from scenario priority target.');
      return priorityTarget.target;
    }
    const candidate = context.analysis?.candidateFunctions[0];
    if (candidate) {
      notes.push('Selected probe target from scenario candidate function.');
      return candidate;
    }
    notes.push('No probe target evidence was available; using unknown-probe-target placeholder.');
    return 'unknown-probe-target';
  }

  private buildSteps(targetName: string, context: ProbeContext): ProbeStep[] {
    const requestAnchor = this.requestAnchorValue(context);
    const steps: ProbeStep[] = [];

    if (!context.window) {
      steps.push({
        purpose: 'Create the smallest inspectable code window before rebuild.',
        step: `Run extract_dependency_window for ${targetName}`,
        stopIf: 'a window with target snippets, preserved inputs, and at least one validation anchor is produced'
      });
    }

    steps.push({
      purpose: 'Confirm helper/function boundary before exporting a rebuild probe.',
      step: `Hook ${targetName} and capture args plus return value`,
      stopIf: 'the same input names and return/output are observed twice in focused replay'
    });

    if (context.window?.inputs.length || context.boundary?.inputs.length) {
      steps.push({
        purpose: 'Freeze the first fixture around the named external inputs.',
        step: `Build a fixture with ${this.inputNames(context).slice(0, 8).join(', ') || 'captured args'}`,
        stopIf: 'fixture inputs cover all freshness fields used by the target output'
      });
    }

    steps.push({
      purpose: 'Validate the smallest output before expanding to request-level behavior.',
      step: `Compare ${this.outputNames(context).slice(0, 6).join(', ') || `${targetName} return`} against hook output`,
      stopIf: 'helper return or request-bound output is stable across the same replay action'
    });

    if (requestAnchor) {
      steps.push({
        purpose: 'Tie helper output to the target request chain.',
        step: `Replay and compare request anchor ${requestAnchor}`,
        stopIf: 'the target request field matches the helper output and the request is reproducible'
      });
    } else {
      steps.push({
        purpose: 'Create a request-level validation anchor if none is available.',
        step: 'Run a focused replay capture with fetch/xhr hooks near targetUrl',
        stopIf: 'a suspicious request or token binding is observed for the target action'
      });
    }

    steps.push({
      purpose: 'Move the smallest verified window into rebuild infrastructure.',
      step: `Export a rebuild bundle using ${targetName} and the preserved fixture inputs`,
      stopIf: 'run_rebuild_probe matches the helper-level expected output'
    });

    return steps;
  }

  private buildFixtureHints(targetName: string, context: ProbeContext): string[] {
    const inputs = this.inputNames(context);
    const freshness = inputs.filter((name) => FRESHNESS_NAME_PATTERN.test(name));
    const outputs = this.outputNames(context);
    return uniqueStrings([
      inputs.length > 0
        ? `Fixture inputs should include: ${inputs.slice(0, 10).join(', ')}.`
        : `Capture args for ${targetName} before building the first fixture.`,
      freshness.length > 0
        ? `Keep freshness fields external: ${freshness.slice(0, 8).join(', ')}.`
        : 'If timestamp/nonce/token appears later, preserve it as an external fixture input.',
      outputs.length > 0
        ? `First expected output(s): ${outputs.slice(0, 8).join(', ')}.`
        : 'Use target return value as the first expected output.',
      context.window?.validationAnchors.find((anchor) => anchor.type === 'request')
        ? 'Include the top request anchor in fixture metadata for request-level compare.'
        : ''
    ].filter(Boolean), 12);
  }

  private buildHookHints(targetName: string, context: ProbeContext, targetUrl: string | undefined): string[] {
    const windowHooks = context.window?.validationAnchors.filter((anchor) => anchor.type === 'hook').map((anchor) => anchor.value) ?? [];
    const sinkAnchors = context.window?.validationAnchors.filter((anchor) => anchor.type === 'sink').map((anchor) => anchor.value) ?? [];
    return uniqueStrings([
      `hook function ${targetName} to capture args and return value`,
      ...context.boundary?.recommendedHooks ?? [],
      ...windowHooks,
      ...sinkAnchors.map((sink) => `hook request sink ${sink} immediately before send`),
      targetUrl ? `hook fetch/xhr near ${targetUrl}` : 'hook fetch/xhr near the top suspicious request URL'
    ], 14);
  }

  private buildValidationChecks(targetName: string, context: ProbeContext): string[] {
    const requestAnchor = this.requestAnchorValue(context);
    const tokenAnchor = context.window?.validationAnchors.find((anchor) => anchor.type === 'token-binding');
    const outputs = this.outputNames(context).filter((name) => OUTPUT_NAME_PATTERN.test(name));
    return uniqueStrings([
      `Confirm ${targetName} return value is deterministic for the same fixture inputs.`,
      outputs.length > 0
        ? `Check helper output against request field(s): ${outputs.slice(0, 8).join(', ')}.`
        : 'Check helper return before request-level output.',
      requestAnchor ? `Confirm replay reproduces ${requestAnchor}.` : 'Confirm a top suspicious request can be reproduced by focused replay.',
      tokenAnchor ? `Check token binding consistency: ${tokenAnchor.value}.` : 'If token/nonce fields appear, verify they bind to the same request across replay.',
      context.capture?.observedRequests.length ? 'Compare observed replay requests against scenario suspicious requests.' : ''
    ].filter(Boolean), 12);
  }

  private buildNextActions(targetName: string, context: ProbeContext): string[] {
    return uniqueStrings([
      !context.window ? `Run extract_dependency_window for ${targetName}.` : '',
      !context.boundary ? `Run extract_helper_boundary for ${targetName}.` : '',
      context.window ? `Use ${targetName} window snippets as the first rebuild export boundary.` : '',
      context.capture ? 'Reuse latest capture evidence for fixture and request anchor selection.' : 'Run run_capture_recipe with a focused action if request evidence is missing.',
      'Run run_rebuild_probe after freezing the smallest fixture.'
    ].filter(Boolean), 10);
  }

  private buildStopConditions(targetName: string, context: ProbeContext): string[] {
    return uniqueStrings([
      `Stop expanding ${targetName} once helper args, return/output, and request anchor are stable.`,
      'Stop broad capture if hook records become noisy before the target helper is confirmed.',
      context.window ? 'Stop adding dependency nodes until the current minimal window fails a rebuild probe.' : '',
      'Stop pure extraction attempts until rebuild probe has a stable helper-level expected output.'
    ].filter(Boolean), 10);
  }

  private scorePriority(context: ProbeContext): number {
    let score = 30;
    if (context.window) {
      score += 35;
    }
    if (context.boundary) {
      score += 18;
    }
    if (context.capture) {
      score += 8;
    }
    if (context.analysis?.suspiciousRequests.length) {
      score += 6;
    }
    if (context.window?.validationAnchors.length) {
      score += 6;
    }
    return Math.max(0, Math.min(100, score));
  }

  private requestAnchorValue(context: ProbeContext): string | null {
    const windowAnchor = context.window?.validationAnchors.find((anchor) => anchor.type === 'request');
    if (windowAnchor) {
      return windowAnchor.value;
    }

    const suspicious = context.analysis?.suspiciousRequests[0];
    if (suspicious) {
      return `${suspicious.method.toUpperCase()} ${suspicious.url}`;
    }

    const observed = context.capture?.observedRequests[0];
    if (observed) {
      return `${observed.method.toUpperCase()} ${observed.url}`;
    }

    return null;
  }

  private inputNames(context: ProbeContext): string[] {
    const fromWindow = context.window?.inputs.filter((input) => input.preserveAsExternal).map((input) => input.name) ?? [];
    const fromBoundary = context.boundary?.inputs.map((input) => input.name) ?? [];
    return uniqueStrings([...fromWindow, ...fromBoundary], 20);
  }

  private outputNames(context: ProbeContext): string[] {
    const fromWindow = context.window?.outputs.map((output) => output.name) ?? [];
    const fromBoundary = context.boundary?.outputs.map((output) => output.name) ?? [];
    return uniqueStrings([...fromWindow, ...fromBoundary], 20);
  }

  private async readWindowSnapshot(taskId: string, notes: string[]): Promise<DependencyWindowResult | null> {
    const stored = await this.readSnapshot<StoredDependencyWindow>(taskId, 'dependency-window/latest', this.isStoredDependencyWindow, notes);
    return stored?.result ?? null;
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

  private isStoredDependencyWindow(value: unknown): value is StoredDependencyWindow {
    return Boolean(value && typeof value === 'object' && 'windowId' in value && 'result' in value);
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

function uniqueStrings(values: readonly string[], limit = Number.POSITIVE_INFINITY): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= limit) {
      break;
    }
  }
  return output;
}
