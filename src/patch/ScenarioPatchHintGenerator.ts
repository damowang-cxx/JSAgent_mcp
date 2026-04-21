import { AppError } from '../core/errors.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { HelperBoundaryRegistry } from '../helper/HelperBoundaryRegistry.js';
import type { HelperBoundaryResult, StoredHelperBoundary } from '../helper/types.js';
import type { StoredProbePlan, ProbePlan } from '../probe/types.js';
import type { ProbePlanRegistry } from '../probe/ProbePlanRegistry.js';
import type { RebuildWorkflowResult, DivergenceRecord, PatchSuggestion } from '../rebuild/types.js';
import type { ReplayRecipeRunner } from '../replay/ReplayRecipeRunner.js';
import type { ReplayRecipeResult } from '../replay/types.js';
import type { ScenarioWorkflowRunner } from '../scenario/ScenarioWorkflowRunner.js';
import type { ScenarioAnalysisResult, ScenarioWorkflowResult } from '../scenario/types.js';
import { confidence, uniqueStrings } from '../scenario/normalization.js';
import type { DependencyWindowRegistry } from '../window/DependencyWindowRegistry.js';
import type { DependencyWindowResult, StoredDependencyWindow } from '../window/types.js';
import { FRESHNESS_NAME_PATTERN, OUTPUT_NAME_PATTERN, SIGNAL_NAME_PATTERN } from '../window/WindowHeuristics.js';
import type { PatchPlanManager } from './PatchPlanManager.js';
import type { PatchWorkflowResult, PatchPlan } from './types.js';
import type { ScenarioPatchHint, ScenarioPatchHintSet, StoredScenarioPatchHintSet } from './types.scenario.js';
import type { PatchWorkflowRunner } from '../workflow/PatchWorkflowRunner.js';
import type { PureExtractionRunner } from '../workflow/PureExtractionRunner.js';
import type { RebuildWorkflowRunner } from '../workflow/RebuildWorkflowRunner.js';

type PatchHintSource = 'probe-last' | 'window-last' | 'helper-boundary-last' | 'task-artifact';

interface ScenarioPatchHintGeneratorDeps {
  dependencyWindowRegistry: DependencyWindowRegistry;
  evidenceStore: EvidenceStore;
  helperBoundaryRegistry: HelperBoundaryRegistry;
  patchPlanManager: PatchPlanManager;
  patchWorkflowRunner: PatchWorkflowRunner;
  probePlanRegistry: ProbePlanRegistry;
  pureExtractionRunner: PureExtractionRunner;
  rebuildWorkflowRunner: RebuildWorkflowRunner;
  replayRecipeRunner: ReplayRecipeRunner;
  scenarioWorkflowRunner: ScenarioWorkflowRunner;
}

interface PatchHintContext {
  boundary: HelperBoundaryResult | null;
  window: DependencyWindowResult | null;
  probe: ProbePlan | null;
  capture: ReplayRecipeResult | null;
  scenario: ScenarioWorkflowResult | null;
  analysis: ScenarioAnalysisResult | null;
  rebuild: RebuildEvidence | null;
  patchWorkflow: PatchWorkflowResult | null;
  patchPlan: PatchPlan | null;
}

interface RebuildEvidence {
  matched?: boolean;
  divergence?: DivergenceRecord | null;
  firstSuggestion?: PatchSuggestion | null;
  runOk?: boolean;
}

export class ScenarioPatchHintGenerator {
  constructor(private readonly deps: ScenarioPatchHintGeneratorDeps) {}

  async generate(options: {
    targetName?: string;
    source?: PatchHintSource;
    taskId?: string;
    targetUrl?: string;
  } = {}): Promise<ScenarioPatchHintSet> {
    const notes: string[] = [];
    const context = await this.readContext(options, notes);
    const targetName = this.resolveTargetName(options.targetName, context, notes);
    const scenario = context.window?.scenario ??
      context.probe?.scenario ??
      context.analysis?.scenario ??
      context.scenario?.preset.scenario ??
      context.capture?.preset.scenario;
    const hints = this.buildHints(targetName, scenario, context);

    if (hints.length === 0) {
      notes.push('No strongly supported scenario patch hint was inferred; collect a helper boundary and dependency window before patching.');
    }

    return {
      basedOn: {
        captureResult: Boolean(context.capture),
        dependencyWindow: Boolean(context.window),
        helperBoundary: Boolean(context.boundary),
        patchWorkflow: Boolean(context.patchWorkflow || context.patchPlan),
        probePlan: Boolean(context.probe),
        rebuildWorkflow: Boolean(context.rebuild),
        scenarioWorkflow: Boolean(context.scenario || context.analysis)
      },
      hints,
      notes: uniqueStrings(notes, 30),
      pureNextActions: this.buildPureNextActions(targetName, hints, context),
      rebuildNextActions: this.buildRebuildNextActions(targetName, hints, context),
      scenario,
      setId: makeSetId(targetName),
      targetName
    };
  }

  private async readContext(
    options: { source?: PatchHintSource; taskId?: string },
    notes: string[]
  ): Promise<PatchHintContext> {
    if (options.source === 'task-artifact' && !options.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'generate_scenario_patch_hints with source=task-artifact requires taskId.');
    }

    const context: PatchHintContext = {
      analysis: null,
      boundary: null,
      capture: null,
      patchPlan: null,
      patchWorkflow: null,
      probe: null,
      rebuild: null,
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
      context.rebuild = await this.readTaskRebuildEvidence(options.taskId, notes);
      context.patchWorkflow = await this.readSnapshot<PatchWorkflowResult>(options.taskId, 'patch-workflow', this.isPatchWorkflowResult, notes);
      context.patchPlan = await this.deps.patchPlanManager.getLatestPlan(options.taskId);
      if (!context.analysis) {
        context.analysis = context.scenario?.analysis ?? context.capture?.scenarioResult ?? null;
      }
      if (context.window || context.boundary || context.probe || context.capture || context.scenario || context.analysis || context.rebuild || context.patchWorkflow || context.patchPlan || options.source === 'task-artifact') {
        return context;
      }
      notes.push('taskId was provided, but scenario patch hint artifacts were not found; falling back to runtime caches.');
    }

    if (options.source === 'probe-last') {
      context.probe = this.deps.probePlanRegistry.getLast();
      notes.push('Using probe-last source: window/helper/scenario/capture/rebuild/patch caches are intentionally ignored.');
      return context;
    }

    if (options.source === 'window-last') {
      context.window = this.deps.dependencyWindowRegistry.getLast();
      notes.push('Using window-last source: probe/helper/scenario/capture/rebuild/patch caches are intentionally ignored.');
      return context;
    }

    if (options.source === 'helper-boundary-last') {
      context.boundary = this.deps.helperBoundaryRegistry.getLast();
      notes.push('Using helper-boundary-last source: probe/window/scenario/capture/rebuild/patch caches are intentionally ignored.');
      return context;
    }

    context.window = this.deps.dependencyWindowRegistry.getLast();
    context.boundary = this.deps.helperBoundaryRegistry.getLast();
    context.probe = this.deps.probePlanRegistry.getLast();
    context.capture = this.deps.replayRecipeRunner.getLastReplayRecipeResult();
    context.scenario = this.deps.scenarioWorkflowRunner.getLastScenarioWorkflowResult();
    context.analysis = context.scenario?.analysis ?? context.capture?.scenarioResult ?? null;
    context.rebuild = this.toRebuildEvidence(this.deps.rebuildWorkflowRunner.getLastRebuildWorkflowResult());
    context.patchWorkflow = this.deps.patchWorkflowRunner.getLastPatchWorkflowResult();
    context.patchPlan = await this.deps.patchPlanManager.getLatestPlan();
    return context;
  }

  private resolveTargetName(explicitTargetName: string | undefined, context: PatchHintContext, notes: string[]): string {
    if (explicitTargetName) {
      return explicitTargetName;
    }
    if (context.probe?.targetName) {
      notes.push('Selected patch target from probe plan.');
      return context.probe.targetName;
    }
    if (context.window?.targetName) {
      notes.push('Selected patch target from dependency window.');
      return context.window.targetName;
    }
    if (context.boundary?.helperName) {
      notes.push('Selected patch target from helper boundary.');
      return context.boundary.helperName;
    }
    const priority = context.analysis?.priorityTargets.find((target) => target.kind === 'helper' || target.kind === 'function') ??
      context.analysis?.priorityTargets[0];
    if (priority) {
      notes.push('Selected patch target from scenario priority target.');
      return priority.target;
    }
    notes.push('No patch target evidence was available; using unknown-patch-target placeholder.');
    return 'unknown-patch-target';
  }

  private buildHints(targetName: string, scenario: string | undefined, context: PatchHintContext): ScenarioPatchHint[] {
    const hints: ScenarioPatchHint[] = [];
    const freshness = this.collectFreshnessInputs(context).slice(0, 8);
    const outputs = this.collectOutputNames(context).slice(0, 8);
    const requestAnchor = this.requestAnchor(context);
    const divergence = context.rebuild?.divergence ?? context.patchPlan?.basedOnDivergence ?? context.patchWorkflow?.patchIterations.at(-1)?.comparison.divergence ?? null;
    const firstSuggestion = context.rebuild?.firstSuggestion ?? context.patchPlan?.selectedSuggestion ?? null;

    if (freshness.length > 0) {
      hints.push(this.makeHint({
        confidence: 0.84,
        focus: `Preserve freshness input(s): ${freshness.join(', ')}`,
        patchableSurface: 'fixture-input',
        scenario,
        suggestedActions: [
          `Move ${freshness.join(', ')} out of constants and into fixture inputs.`,
          'Rerun rebuild probe before changing env-shim behavior.',
          'Compare helper output before expanding to request-level validation.'
        ],
        targetName,
        why: 'Dependency window or boundary marked these token/nonce/timestamp-style fields as preserved inputs.',
        stopIf: [
          'Stop if the same freshness values already come from fixture inputs.',
          'Stop if helper return still changes after all freshness inputs are externalized.'
        ]
      }));
    }

    if (outputs.length > 0) {
      hints.push(this.makeHint({
        confidence: 0.78,
        focus: `Compare helper/window output first: ${outputs.join(', ')}`,
        patchableSurface: 'compare-anchor',
        scenario,
        suggestedActions: [
          `Set the first compare anchor to ${outputs[0]}.`,
          'Avoid whole-response comparison until helper-level output matches.',
          requestAnchor ? `Keep request anchor ${requestAnchor} as second-level validation.` : 'Add a focused request anchor after helper output matches.'
        ],
        targetName,
        why: 'Boundary/window outputs provide a smaller explainable mismatch surface than broad response comparison.',
        stopIf: [
          'Stop if helper return or request-bound field matches.',
          'Stop if the compare anchor is no longer tied to target request evidence.'
        ]
      }));
    }

    if (requestAnchor) {
      hints.push(this.makeHint({
        confidence: 0.74,
        focus: `Validate against request anchor ${requestAnchor}`,
        patchableSurface: 'request-validation',
        scenario,
        suggestedActions: [
          `Use ${requestAnchor} as the first request-level validation anchor.`,
          'Compare sign/token/challenge fields rather than the full request or response body.',
          'Keep fetch/xhr hook evidence attached to this request while patching.'
        ],
        targetName,
        why: 'Scenario/capture/window evidence promoted this request as the target-chain validation point.',
        stopIf: [
          'Stop if replay cannot reproduce the request anchor.',
          'Stop if another request has higher scenario score and matching helper output.'
        ]
      }));
    }

    if (context.window) {
      hints.push(this.makeHint({
        confidence: 0.72,
        focus: `Patch inside minimal helper window ${context.window.targetName}`,
        patchableSurface: 'helper-window',
        scenario,
        suggestedActions: [
          `Patch only the dependency window for ${context.window.targetName} before broadening bundle scope.`,
          'Keep crypto/token transforms intact until helper output comparison identifies the first divergence.',
          'Expand dependency nodes only after the current window fails rebuild probe for an explainable reason.'
        ],
        targetName,
        why: 'A dependency window exists and is the smallest current patchable code surface.',
        stopIf: [
          'Stop expanding the window if the current helper output matches.',
          'Stop if the patch would replace observed helper logic with a site-specific constant.'
        ]
      }));
    }

    if (divergence?.kind === 'missing-global' || divergence?.kind === 'missing-property' || divergence?.kind === 'runtime-error') {
      hints.push(this.makeHint({
        confidence: firstSuggestion ? firstSuggestion.confidence : 0.68,
        focus: `Patch first rebuild divergence: ${divergence.path}`,
        patchableSurface: 'env-shim',
        scenario,
        suggestedActions: [
          firstSuggestion ? `Start from existing patch suggestion for ${firstSuggestion.target}.` : `Add the smallest shim needed for ${divergence.path}.`,
          'Do not add broad browser emulation before helper-window output is checked.',
          'Rerun run_rebuild_probe immediately after one shim change.'
        ],
        targetName,
        why: `Rebuild evidence reports ${divergence.kind}: ${divergence.message}`,
        stopIf: [
          'Stop if the divergence moves away from the helper/window target.',
          'Stop if the shim masks sign/token/challenge inputs instead of preserving them.'
        ]
      }));
    }

    if (context.patchWorkflow?.patchIterations.at(-1)?.divergenceProgress.unchanged || context.patchWorkflow?.patchIterations.at(-1)?.divergenceProgress.worsened) {
      hints.push(this.makeHint({
        confidence: 0.66,
        focus: 'Reset patch focus to fixture inputs or compare anchor',
        patchableSurface: 'compare-anchor',
        scenario,
        suggestedActions: [
          'Stop adding another broad env-shim patch.',
          outputs[0] ? `Compare ${outputs[0]} directly before another patch iteration.` : 'Add helper return as the first compare anchor.',
          freshness.length > 0 ? `Verify freshness input(s) ${freshness.join(', ')} are fixture-driven.` : 'Capture missing helper inputs before another patch.'
        ],
        targetName,
        why: 'Latest patch iteration did not improve the first divergence.',
        stopIf: [
          'Stop if a smaller helper-level mismatch cannot be reproduced.',
          'Stop if no current fixture candidate exists.'
        ]
      }));
    }

    return dedupeHints(hints)
      .sort((left, right) => right.confidence - left.confidence || left.focus.localeCompare(right.focus))
      .slice(0, 8);
  }

  private buildRebuildNextActions(targetName: string, hints: readonly ScenarioPatchHint[], context: PatchHintContext): string[] {
    const first = hints[0];
    const requestAnchor = this.requestAnchor(context);
    return uniqueStrings([
      first ? `Apply only the first ${first.patchableSurface} hint: ${first.focus}.` : `Generate boundary/window evidence before patching ${targetName}.`,
      requestAnchor ? `Use ${requestAnchor} as request-level validation after helper output matches.` : '',
      context.window ? `Keep rebuild export centered on ${context.window.targetName} minimal dependency window.` : 'Run extract_dependency_window before rebuilding.',
      'Rerun run_rebuild_probe after one focused patch; compare first divergence before adding another patch.',
      'Avoid broad env-shim changes until fixture inputs and helper output are stable.'
    ].filter(Boolean), 10);
  }

  private buildPureNextActions(targetName: string, hints: readonly ScenarioPatchHint[], context: PatchHintContext): string[] {
    const outputs = this.collectOutputNames(context).slice(0, 6);
    const freshness = this.collectFreshnessInputs(context).slice(0, 6);
    return uniqueStrings([
      freshness.length > 0 ? `Freeze freshness inputs before pure workflow: ${freshness.join(', ')}.` : `Freeze helper args for ${targetName} before pure workflow.`,
      outputs.length > 0 ? `Use ${outputs.join(', ')} as expected output candidates after rebuild matches.` : 'Use helper return as the first pure expected output after rebuild matches.',
      'Do not start pure extraction until a focused rebuild probe matches the fixture output.',
      hints.some((hint) => hint.patchableSurface === 'env-shim') ? 'Carry only the minimal accepted env shim into pure preflight notes.' : ''
    ].filter(Boolean), 10);
  }

  private collectFreshnessInputs(context: PatchHintContext): string[] {
    return uniqueStrings([
      ...context.window?.inputs.filter((input) => input.preserveAsExternal || FRESHNESS_NAME_PATTERN.test(input.name)).map((input) => input.name) ?? [],
      ...context.boundary?.inputs.filter((input) => FRESHNESS_NAME_PATTERN.test(input.name)).map((input) => input.name) ?? [],
      ...context.probe?.fixtureHints.flatMap((hint) => extractNames(hint)).filter((name) => FRESHNESS_NAME_PATTERN.test(name)) ?? []
    ], 20);
  }

  private collectOutputNames(context: PatchHintContext): string[] {
    return uniqueStrings([
      ...context.window?.outputs.filter((output) => output.target !== 'intermediate' || OUTPUT_NAME_PATTERN.test(output.name)).map((output) => output.name) ?? [],
      ...context.boundary?.outputs.map((output) => output.name) ?? [],
      ...context.probe?.validationChecks.flatMap((check) => extractNames(check)).filter((name) => OUTPUT_NAME_PATTERN.test(name)) ?? []
    ], 20);
  }

  private requestAnchor(context: PatchHintContext): string | null {
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

  private makeHint(input: Omit<ScenarioPatchHint, 'hintId'>): ScenarioPatchHint {
    return {
      ...input,
      confidence: confidence(input.confidence),
      hintId: `${input.patchableSurface}-${Math.abs(hashText(`${input.targetName}:${input.focus}`)).toString(36)}`
    };
  }

  private async readTaskRebuildEvidence(taskId: string, notes: string[]): Promise<RebuildEvidence | null> {
    const run = await this.readSnapshot<unknown>(taskId, 'rebuild-run', this.anyValue, notes);
    const comparison = await this.readSnapshot<unknown>(taskId, 'divergence', this.anyValue, notes);
    const patch = await this.readSnapshot<unknown>(taskId, 'patch-suggestions', this.anyValue, notes);
    if (!run && !comparison && !patch) {
      return null;
    }
    return {
      divergence: readDivergence(comparison),
      firstSuggestion: readFirstSuggestion(patch),
      matched: readMatched(comparison),
      runOk: readRunOk(run)
    };
  }

  private toRebuildEvidence(result: RebuildWorkflowResult | null): RebuildEvidence | null {
    if (!result) {
      return null;
    }
    return {
      divergence: result.comparison.divergence ?? null,
      firstSuggestion: result.patch.firstSuggestion ?? null,
      matched: result.comparison.matched,
      runOk: result.run.ok
    };
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

  private anyValue(value: unknown): value is unknown {
    return value !== undefined;
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

  private isPatchWorkflowResult(value: unknown): value is PatchWorkflowResult {
    return Boolean(value && typeof value === 'object' && 'patchIterations' in value && 'readyForPureExtraction' in value);
  }

  private toMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

function makeSetId(targetName: string): string {
  const safeName = targetName.replace(/[^A-Za-z0-9_$.-]+/g, '-').slice(0, 80) || 'patch-hints';
  return `${safeName}-${Date.now().toString(36)}`;
}

function extractNames(value: string): string[] {
  return uniqueStrings(
    Array.from(value.matchAll(/\b[A-Za-z_$][\w$.-]{1,60}\b/g))
      .map((match) => match[0])
      .filter((name) => !STOP_WORDS.has(name.toLowerCase())),
    20
  );
}

function dedupeHints(values: readonly ScenarioPatchHint[]): ScenarioPatchHint[] {
  const byKey = new Map<string, ScenarioPatchHint>();
  for (const value of values) {
    const key = `${value.patchableSurface}:${value.focus.toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing || value.confidence > existing.confidence) {
      byKey.set(key, value);
    }
  }
  return Array.from(byKey.values());
}

function readDivergence(value: unknown): DivergenceRecord | null {
  const record = asRecord(value);
  const divergence = asRecord(record?.divergence) ?? record;
  if (!divergence || typeof divergence.kind !== 'string' || typeof divergence.path !== 'string') {
    return null;
  }
  return divergence as unknown as DivergenceRecord;
}

function readMatched(value: unknown): boolean | undefined {
  const record = asRecord(value);
  return typeof record?.matched === 'boolean' ? record.matched : undefined;
}

function readFirstSuggestion(value: unknown): PatchSuggestion | null {
  const record = asRecord(value);
  const first = asRecord(record?.firstSuggestion) ?? (Array.isArray(record?.suggestions) ? asRecord(record.suggestions[0]) : null);
  if (!first || typeof first.target !== 'string' || typeof first.patchType !== 'string') {
    return null;
  }
  return first as unknown as PatchSuggestion;
}

function readRunOk(value: unknown): boolean | undefined {
  const record = asRecord(value);
  return typeof record?.ok === 'boolean' ? record.ok : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function hashText(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

const STOP_WORDS = new Set([
  'helper',
  'return',
  'request',
  'field',
  'fields',
  'compare',
  'anchor',
  'against',
  'check',
  'confirm',
  'replay',
  'token',
  'binding',
  'consistency',
  'same',
  'fixture',
  'output',
  'outputs',
  'input',
  'inputs'
]);
