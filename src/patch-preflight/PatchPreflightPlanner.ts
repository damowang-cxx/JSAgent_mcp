import type { CompareAnchorSelectionResult, StoredCompareAnchorSnapshot } from '../compare/types.js';
import { AppError } from '../core/errors.js';
import type { DebuggerEvidenceCorrelator } from '../debugger/DebuggerEvidenceCorrelator.js';
import type { DebuggerSessionManager } from '../debugger/DebuggerSessionManager.js';
import type { StoredDebuggerInspectionSnapshot } from '../debugger/types.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { FixtureCandidateRegistry } from '../fixture/FixtureCandidateRegistry.js';
import type { StoredFixtureCandidate } from '../fixture/types.js';
import type { HelperBoundaryRegistry } from '../helper/HelperBoundaryRegistry.js';
import type { StoredHelperBoundary } from '../helper/types.js';
import type { CompareAnchorSelector } from '../compare/CompareAnchorSelector.js';
import type { CompareAnchorRegistry } from '../compare/CompareAnchorRegistry.js';
import type { PatchPlan, PatchWorkflowResult } from '../patch/types.js';
import type { PatchPlanManager } from '../patch/PatchPlanManager.js';
import type { ScenarioPatchHintRegistry } from '../patch/ScenarioPatchHintRegistry.js';
import type { StoredScenarioPatchHintSet } from '../patch/types.scenario.js';
import type { ProbePlanRegistry } from '../probe/ProbePlanRegistry.js';
import type { StoredProbePlan } from '../probe/types.js';
import type { ReplayRecipeRunner } from '../replay/ReplayRecipeRunner.js';
import type { ReplayRecipeResult } from '../replay/types.js';
import type { DivergenceComparisonResult, RebuildWorkflowResult } from '../rebuild/types.js';
import type { ScenarioWorkflowRunner } from '../scenario/ScenarioWorkflowRunner.js';
import type { ScenarioWorkflowResult } from '../scenario/types.js';
import type { TaskManifestManager } from '../task/TaskManifestManager.js';
import type { RebuildWorkflowRunner } from '../workflow/RebuildWorkflowRunner.js';
import type { PatchWorkflowRunner } from '../workflow/PatchWorkflowRunner.js';
import type { DependencyWindowRegistry } from '../window/DependencyWindowRegistry.js';
import type { StoredDependencyWindow } from '../window/types.js';
import type { PatchableSurface, PatchPreflightFocus, PatchPreflightResult } from './types.js';

interface PatchPreflightPlannerDeps {
  compareAnchorSelector: CompareAnchorSelector;
  compareAnchorRegistry: CompareAnchorRegistry;
  scenarioPatchHintRegistry: ScenarioPatchHintRegistry;
  fixtureCandidateRegistry: FixtureCandidateRegistry;
  dependencyWindowRegistry: DependencyWindowRegistry;
  probePlanRegistry: ProbePlanRegistry;
  helperBoundaryRegistry: HelperBoundaryRegistry;
  debuggerEvidenceCorrelator: DebuggerEvidenceCorrelator;
  debuggerSessionManager: DebuggerSessionManager;
  replayRecipeRunner: ReplayRecipeRunner;
  scenarioWorkflowRunner: ScenarioWorkflowRunner;
  rebuildWorkflowRunner: RebuildWorkflowRunner;
  patchWorkflowRunner: PatchWorkflowRunner;
  patchPlanManager: PatchPlanManager;
  evidenceStore: EvidenceStore;
  taskManifestManager: TaskManifestManager;
}

interface PatchPreflightContext {
  compareAnchor?: CompareAnchorSelectionResult | null;
  patchHints?: StoredScenarioPatchHintSet['result'] | null;
  fixture?: StoredFixtureCandidate['result'] | null;
  dependencyWindow?: StoredDependencyWindow['result'] | null;
  probePlan?: StoredProbePlan['result'] | null;
  helperBoundary?: StoredHelperBoundary['result'] | null;
  debuggerInspection?: StoredDebuggerInspectionSnapshot | null;
  capture?: ReplayRecipeResult | null;
  scenario?: ScenarioWorkflowResult | null;
  rebuild?: RebuildWorkflowResult | null;
  divergence?: DivergenceComparisonResult | null;
  patchWorkflow?: PatchWorkflowResult | null;
  patchPlan?: PatchPlan | null;
  notes: string[];
}

const DEFAULT_MAX_CANDIDATES = 10;
const FRESHNESS_PATTERN = /\b(timestamp|nonce|ts|_t|time|token|challenge|verify|captcha|fingerprint)\b/i;
const SIGNAL_PATTERN = /\b(sign|signature|x-?sign|token|auth|authorization|nonce|challenge|verify|captcha|fingerprint|hash|hmac|cipher|enc)\b/i;
const ENV_PATTERN = /\b(window|document|navigator|location|localStorage|sessionStorage|cookie|crypto|TextEncoder|TextDecoder|atob|btoa|performance|DOM|global|env|shim)\b/i;

export class PatchPreflightPlanner {
  constructor(private readonly deps: PatchPreflightPlannerDeps) {}

  async plan(options: {
    taskId?: string;
    targetUrl?: string;
    source?: 'runtime-last' | 'task-artifact';
    maxCandidates?: number;
  } = {}): Promise<PatchPreflightResult> {
    if (options.source === 'task-artifact' && !options.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'plan_patch_preflight with source=task-artifact requires taskId.');
    }

    const maxCandidates = Math.max(1, Math.min(30, Math.floor(options.maxCandidates ?? DEFAULT_MAX_CANDIDATES)));
    const context = options.source === 'task-artifact'
      ? await this.readTaskContext(options.taskId as string)
      : await this.readRuntimeContext(options.targetUrl, maxCandidates);

    const candidates = mergeCandidates(this.buildCandidates(context))
      .sort((left, right) => rankFocus(right) - rankFocus(left) || surfacePriority(left.surface) - surfacePriority(right.surface))
      .slice(0, maxCandidates);
    const selected = candidates[0] ?? null;
    const compareAnchorUsed = context.compareAnchor?.selected
      ? {
          anchorId: context.compareAnchor.selected.anchorId,
          kind: context.compareAnchor.selected.kind,
          label: context.compareAnchor.selected.label
        }
      : null;

    return {
      candidates,
      compareAnchorUsed,
      nextActions: this.buildNextActions(selected, compareAnchorUsed),
      notes: [
        ...context.notes,
        compareAnchorUsed
          ? `Patch preflight consumed compare anchor ${compareAnchorUsed.label} (${compareAnchorUsed.kind}).`
          : 'No compare anchor was available; preflight may recommend selecting one before patching.',
        selected
          ? `Selected ${selected.surface} because it is the smallest evidence-backed patch surface currently available.`
          : 'No patch preflight focus selected because no concrete compare/boundary/fixture/debugger/rebuild evidence is available.'
      ],
      selected,
      stopIf: this.buildStopIf(selected)
    };
  }

  private async readRuntimeContext(targetUrl: string | undefined, maxCandidates: number): Promise<PatchPreflightContext> {
    const notes: string[] = ['Runtime source enabled; latest in-memory evidence was used.'];
    let compareAnchor = this.deps.compareAnchorRegistry.getLast();
    if (!compareAnchor) {
      compareAnchor = await this.deps.compareAnchorSelector.select({
        maxCandidates,
        source: 'runtime-last',
        targetUrl
      });
      notes.push('No cached compare anchor was available; selected one from current runtime evidence.');
    }

    let debuggerInspection: StoredDebuggerInspectionSnapshot | null = null;
    if (this.deps.debuggerSessionManager.isPaused()) {
      debuggerInspection = {
        callFrames: this.deps.debuggerSessionManager.getCallFrames(),
        correlations: await this.deps.debuggerEvidenceCorrelator.correlatePausedState({ targetUrl }),
        createdAt: new Date().toISOString(),
        notes: ['Debugger paused state was consumed as enhancer evidence only.']
      };
    }

    return {
      capture: this.deps.replayRecipeRunner.getLastReplayRecipeResult(),
      compareAnchor,
      debuggerInspection,
      dependencyWindow: this.deps.dependencyWindowRegistry.getLast(),
      fixture: this.deps.fixtureCandidateRegistry.getLast(),
      helperBoundary: this.deps.helperBoundaryRegistry.getLast(),
      notes,
      patchHints: this.deps.scenarioPatchHintRegistry.getLast(),
      patchPlan: await this.deps.patchPlanManager.getLatestPlan(),
      patchWorkflow: this.deps.patchWorkflowRunner.getLastPatchWorkflowResult(),
      probePlan: this.deps.probePlanRegistry.getLast(),
      rebuild: this.deps.rebuildWorkflowRunner.getLastRebuildWorkflowResult(),
      scenario: this.deps.scenarioWorkflowRunner.getLastScenarioWorkflowResult()
    };
  }

  private async readTaskContext(taskId: string): Promise<PatchPreflightContext> {
    await this.deps.taskManifestManager.ensureTask(taskId);
    const [compareAnchor, patchHints, fixture, dependencyWindow, probePlan, helperBoundary, debuggerInspection, capture, scenario, patchWorkflow, divergence] = await Promise.all([
      this.readStoredResult<StoredCompareAnchorSnapshot>(taskId, 'compare-anchor/latest'),
      this.readStoredResult<StoredScenarioPatchHintSet>(taskId, 'scenario-patch-hints/latest'),
      this.readStoredResult<StoredFixtureCandidate>(taskId, 'boundary-fixture/latest'),
      this.readStoredResult<StoredDependencyWindow>(taskId, 'dependency-window/latest'),
      this.readStoredResult<StoredProbePlan>(taskId, 'scenario-probe/latest'),
      this.readStoredResult<StoredHelperBoundary>(taskId, 'helper-boundary/latest'),
      this.readSnapshot<StoredDebuggerInspectionSnapshot>(taskId, 'debugger/inspection-last'),
      this.readSnapshot<ReplayRecipeResult>(taskId, 'scenario/capture/result'),
      this.readSnapshot<ScenarioWorkflowResult>(taskId, 'scenario/workflow'),
      this.readSnapshot<PatchWorkflowResult>(taskId, 'patch-workflow'),
      this.readSnapshot<DivergenceComparisonResult>(taskId, 'divergence')
    ]);

    return {
      capture,
      compareAnchor,
      debuggerInspection,
      dependencyWindow,
      divergence,
      fixture,
      helperBoundary,
      notes: [`Task artifact source enabled for ${taskId}; runtime caches were not used.`],
      patchHints,
      patchPlan: await this.deps.patchPlanManager.getLatestPlan(taskId),
      patchWorkflow,
      probePlan,
      rebuild: null,
      scenario
    };
  }

  private buildCandidates(context: PatchPreflightContext): PatchPreflightFocus[] {
    const candidates: PatchPreflightFocus[] = [];

    const anchor = context.compareAnchor?.selected;
    if (anchor) {
      const surface: PatchableSurface = anchor.kind === 'request-level' || anchor.kind === 'unknown'
        ? 'compare-anchor'
        : anchor.kind === 'helper-return'
          ? 'helper-window'
          : 'request-validation';
      candidates.push(makeFocus({
        confidence: anchor.kind === 'request-level' ? 0.62 : 0.78 + anchor.confidence * 0.08,
        notes: anchor.notes,
        reason: anchor.kind === 'request-level'
          ? `Selected compare anchor is still request-level (${anchor.label}); patch preflight should first narrow compare scope before patching.`
          : `Selected compare anchor ${anchor.label} (${anchor.kind}) defines the first divergence surface: ${anchor.reason}`,
        suggestedAction: anchor.kind === 'request-level'
          ? 'Run extract_helper_boundary/generate_boundary_fixture or select_compare_anchor again after focused capture before broad patching.'
          : `Run compare_rebuild_result around ${anchor.path ?? anchor.label}, then patch only the code or fixture path feeding that anchor.`,
        surface,
        target: anchor.path ?? anchor.label
      }));
    } else {
      candidates.push(makeFocus({
        confidence: 0.48,
        reason: 'No compare anchor is available, so patching would fall back to generic first-divergence behavior.',
        suggestedAction: 'Run select_compare_anchor before run_patch_iteration.',
        surface: 'compare-anchor',
        target: 'select compare anchor'
      }));
    }

    for (const hint of context.patchHints?.hints ?? []) {
      candidates.push(makeFocus({
        confidence: 0.55 + hint.confidence * 0.28,
        notes: hint.stopIf,
        reason: `Scenario patch hint identifies ${hint.focus}: ${hint.why}`,
        suggestedAction: hint.suggestedActions[0] ?? `Patch only the ${hint.patchableSurface} surface for ${hint.targetName}.`,
        surface: normalizePatchSurface(hint.patchableSurface),
        target: hint.focus
      }));
    }

    for (const input of context.fixture?.inputs ?? []) {
      if (!input.required && !input.preserveFreshness && !FRESHNESS_PATTERN.test(input.name)) {
        continue;
      }
      candidates.push(makeFocus({
        confidence: 0.68 + input.confidence * 0.2 + (input.preserveFreshness ? 0.08 : 0),
        reason: `Boundary fixture input ${input.name} is ${input.required ? 'required' : 'optional'} and freshness=${input.preserveFreshness}: ${input.reason}`,
        suggestedAction: `Keep ${input.name} as a fixture input before patching helper/env code; do not inline it as a constant.`,
        surface: 'fixture-input',
        target: input.name
      }));
    }

    for (const output of context.fixture?.expectedOutputs ?? []) {
      candidates.push(makeFocus({
        confidence: 0.66 + output.confidence * 0.18,
        reason: `Boundary fixture expected output ${output.name} -> ${output.target} is already the smallest output check: ${output.reason}`,
        suggestedAction: `Patch toward matching ${output.name} first, then expand to request-level validation only after it matches.`,
        surface: output.target === 'helper-return' ? 'helper-window' : 'request-validation',
        target: output.name
      }));
    }

    for (const hint of context.dependencyWindow?.rebuildPreflightHints ?? []) {
      candidates.push(focusFromHint(hint, 'dependency-window', 0.62));
    }

    for (const output of context.dependencyWindow?.outputs ?? []) {
      candidates.push(makeFocus({
        confidence: 0.62 + output.confidence * 0.16,
        reason: `Dependency window output ${output.name} -> ${output.target} is a bounded patch target: ${output.reason}`,
        suggestedAction: `Constrain patching to the dependency window around ${context.dependencyWindow?.targetName ?? output.name}.`,
        surface: output.target === 'return' ? 'helper-window' : 'request-validation',
        target: output.name
      }));
    }

    for (const check of context.probePlan?.validationChecks ?? []) {
      candidates.push(makeFocus({
        confidence: 0.58 + (SIGNAL_PATTERN.test(check) ? 0.1 : 0),
        reason: `Probe validation check is an explicit first-divergence target: ${check}`,
        suggestedAction: 'Run compare_rebuild_result against this validation check before patching broader surfaces.',
        surface: /hook|helper|function/i.test(check) ? 'helper-window' : 'request-validation',
        target: extractTarget(check)
      }));
    }

    for (const hookHint of context.probePlan?.hookHints ?? []) {
      candidates.push(makeFocus({
        confidence: 0.54,
        reason: `Probe plan recommends focused hook evidence before patching: ${hookHint}`,
        suggestedAction: 'Use the hook/debugger evidence to confirm the helper boundary before run_patch_iteration.',
        surface: 'helper-window',
        target: extractTarget(hookHint)
      }));
    }

    for (const hint of context.helperBoundary?.rebuildHints ?? []) {
      candidates.push(focusFromHint(hint, `helper-boundary:${context.helperBoundary?.helperName ?? 'helper'}`, 0.58));
    }

    for (const correlation of context.debuggerInspection?.correlations ?? []) {
      candidates.push(makeFocus({
        confidence: 0.42 + correlation.confidence * 0.22,
        reason: `Debugger correlation ${correlation.kind} points at ${correlation.value}: ${correlation.reason}`,
        suggestedAction: correlation.kind === 'hook' || correlation.kind === 'sink'
          ? 'Use evaluate_on_call_frame or get_scope_variables to confirm the helper/window value before patching.'
          : 'Use debugger evidence only to refine the compare/request validation anchor.',
        surface: correlation.kind === 'request' ? 'request-validation' : 'helper-window',
        target: extractTarget(correlation.value)
      }));
    }

    for (const evaluation of context.debuggerInspection?.evaluations ?? []) {
      if (!evaluation.ok) {
        continue;
      }
      candidates.push(makeFocus({
        confidence: 0.62,
        reason: `Debugger evaluation produced ${evaluation.preview ?? evaluation.resultType ?? 'a paused value'} for helper/sink state.`,
        suggestedAction: 'Patch only after this paused value is tied to a compare anchor or fixture expected output.',
        surface: 'helper-window',
        target: evaluation.preview ?? evaluation.resultType ?? 'debugger evaluation'
      }));
    }

    const divergence = context.divergence?.divergence ?? context.rebuild?.comparison?.divergence ?? context.patchWorkflow?.rebuild?.comparison.divergence;
    if (divergence) {
      candidates.push(makeFocus({
        confidence: divergence.severity === 'high' && ENV_PATTERN.test(`${divergence.path} ${divergence.message}`) ? 0.82 : 0.5,
        reason: `Latest rebuild divergence is ${divergence.kind} at ${divergence.path}: ${divergence.message}`,
        suggestedAction: divergence.kind === 'missing-global' || ENV_PATTERN.test(`${divergence.path} ${divergence.message}`)
          ? `Add the narrowest env shim for ${divergence.path}, then rerun compare against the selected anchor.`
          : `Do not patch broad env first; compare ${divergence.path} against the selected anchor and boundary fixture.`,
        surface: divergence.kind === 'missing-global' || ENV_PATTERN.test(`${divergence.path} ${divergence.message}`) ? 'env-shim' : surfaceFromText(divergence.path),
        target: divergence.path
      }));
    }

    if (context.patchPlan?.selectedSuggestion) {
      const suggestion = context.patchPlan.selectedSuggestion;
      candidates.push(makeFocus({
        confidence: 0.5 + suggestion.confidence * 0.18,
        reason: `Latest patch plan selected ${suggestion.patchType} for ${suggestion.target}: ${suggestion.reason}`,
        suggestedAction: 'Use this only after confirming it still matches the selected compare anchor.',
        surface: surfaceFromPatchType(suggestion.patchType, suggestion.target),
        target: suggestion.target
      }));
    }

    return candidates.filter((candidate) => candidate.surface !== 'env-shim' || hasEnvEvidence(candidate));
  }

  private buildNextActions(selected: PatchPreflightFocus | null, compareAnchorUsed: PatchPreflightResult['compareAnchorUsed']): string[] {
    if (!selected) {
      return [
        'Run select_compare_anchor before patching.',
        'Generate boundary fixture and scenario patch hints so preflight can identify a focused surface.'
      ];
    }

    const anchorText = compareAnchorUsed ? ` using compare anchor ${compareAnchorUsed.label}` : '';
    const common = `Do one patch attempt for ${selected.surface}:${selected.target}${anchorText}, then rerun compare_rebuild_result.`;
    if (selected.surface === 'fixture-input') {
      return [
        `Update or regenerate fixture input ${selected.target} before patching code.`,
        common,
        'Run generate_boundary_fixture if freshness fields are still being inlined.'
      ];
    }
    if (selected.surface === 'compare-anchor') {
      return [
        'Run select_compare_anchor or narrow the current anchor before applying code patches.',
        'Only run run_patch_iteration after the first compare target is helper-return/request-field/header/body-field instead of broad request/object output.'
      ];
    }
    if (selected.surface === 'request-validation') {
      return [
        `Compare only request/header/body field ${selected.target} before full request comparison.`,
        common,
        'Use run_capture_recipe if the request validation anchor is not reproducible.'
      ];
    }
    if (selected.surface === 'helper-window') {
      return [
        `Constrain patching to helper/window target ${selected.target}.`,
        'Use extract_dependency_window or evaluate_on_call_frame if the helper input/output is not yet confirmed.',
        common
      ];
    }
    if (selected.surface === 'env-shim') {
      return [
        `Add only the narrow env shim required by ${selected.target}; do not broaden browser emulation.`,
        common,
        'Stop env patching once the selected compare anchor moves forward or matches.'
      ];
    }

    return [common];
  }

  private buildStopIf(selected: PatchPreflightFocus | null): string[] {
    if (!selected) {
      return [
        'Stop if no compare anchor, fixture, boundary, window, patch-hint, debugger, or rebuild evidence exists.',
        'Do not start a broad patch iteration without a first patch focus.'
      ];
    }

    return [
      `Stop if ${selected.surface}:${selected.target} cannot be tied to current evidence.`,
      'Stop if the proposed patch expands beyond the selected compare anchor or helper/window boundary.',
      selected.surface === 'env-shim'
        ? 'Stop env-shim work as soon as the missing env contract is satisfied; return to compare-anchor validation.'
        : 'Stop before adding env shims unless a concrete missing-global/missing-property divergence proves they are needed.'
    ];
  }

  private async readSnapshot<T>(taskId: string, name: string): Promise<T | null> {
    try {
      const value = await this.deps.evidenceStore.readSnapshot(taskId, name);
      return value ? value as T : null;
    } catch {
      return null;
    }
  }

  private async readStoredResult<T extends { result: unknown }>(taskId: string, name: string): Promise<T['result'] | null> {
    const snapshot = await this.readSnapshot<T>(taskId, name);
    return snapshot?.result ?? null;
  }
}

function makeFocus(input: {
  surface: PatchableSurface;
  target: string;
  confidence: number;
  reason: string;
  suggestedAction: string;
  notes?: string[];
}): PatchPreflightFocus {
  return {
    confidence: Number(clamp(input.confidence).toFixed(3)),
    notes: input.notes,
    reason: input.reason,
    suggestedAction: input.suggestedAction,
    surface: input.surface,
    target: input.target.trim() || input.surface
  };
}

function focusFromHint(hint: string, origin: string, baseConfidence: number): PatchPreflightFocus {
  const surface = surfaceFromText(hint);
  return makeFocus({
    confidence: baseConfidence + (SIGNAL_PATTERN.test(hint) ? 0.08 : 0) + (surface === 'env-shim' ? 0.02 : 0),
    reason: `${origin} preflight hint: ${hint}`,
    suggestedAction: actionForSurface(surface, extractTarget(hint)),
    surface,
    target: extractTarget(hint)
  });
}

function surfaceFromText(value: string): PatchableSurface {
  if (/fixture|freshness|external input|timestamp|nonce|token|preserve/i.test(value)) {
    return 'fixture-input';
  }
  if (/compare|anchor|expected output|return/i.test(value)) {
    return 'compare-anchor';
  }
  if (/request|header|body|field|validation|signature|sign|challenge|fingerprint/i.test(value)) {
    return 'request-validation';
  }
  if (/helper|window|boundary|dependency|function/i.test(value)) {
    return 'helper-window';
  }
  if (ENV_PATTERN.test(value)) {
    return 'env-shim';
  }
  return 'unknown';
}

function normalizePatchSurface(value: string): PatchableSurface {
  if (value === 'fixture-input' || value === 'compare-anchor' || value === 'request-validation' || value === 'helper-window' || value === 'env-shim') {
    return value;
  }
  return 'unknown';
}

function surfaceFromPatchType(patchType: string, target: string): PatchableSurface {
  if (patchType === 'value-seed') {
    return 'fixture-input';
  }
  if (patchType === 'defer-and-observe') {
    return 'helper-window';
  }
  if (patchType === 'shim' || patchType === 'polyfill') {
    return ENV_PATTERN.test(target) ? 'env-shim' : 'helper-window';
  }
  return 'unknown';
}

function actionForSurface(surface: PatchableSurface, target: string): string {
  if (surface === 'fixture-input') {
    return `Preserve ${target} as a fixture input and rerun compare before code patching.`;
  }
  if (surface === 'compare-anchor') {
    return `Narrow compare anchor to ${target} before running patch iteration.`;
  }
  if (surface === 'request-validation') {
    return `Validate only request/header/body field ${target} before full request comparison.`;
  }
  if (surface === 'helper-window') {
    return `Constrain patch to helper/window ${target}.`;
  }
  if (surface === 'env-shim') {
    return `Add the narrowest env shim for ${target}.`;
  }
  return `Collect more evidence for ${target} before patching.`;
}

function mergeCandidates(candidates: readonly PatchPreflightFocus[]): PatchPreflightFocus[] {
  const byKey = new Map<string, PatchPreflightFocus>();
  for (const candidate of candidates) {
    const key = `${candidate.surface}:${candidate.target.toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, candidate);
      continue;
    }
    byKey.set(key, {
      ...existing,
      confidence: Math.max(existing.confidence, candidate.confidence),
      notes: uniqueStrings([...(existing.notes ?? []), ...(candidate.notes ?? [])], 8),
      reason: `${existing.reason} Additional evidence: ${candidate.reason}`,
      suggestedAction: existing.confidence >= candidate.confidence ? existing.suggestedAction : candidate.suggestedAction
    });
  }
  return Array.from(byKey.values());
}

function rankFocus(focus: PatchPreflightFocus): number {
  return focus.confidence + (5 - surfacePriority(focus.surface)) * 0.025;
}

function surfacePriority(surface: PatchableSurface): number {
  return {
    'compare-anchor': 0,
    'fixture-input': 1,
    'request-validation': 2,
    'helper-window': 3,
    'env-shim': 4,
    unknown: 5
  }[surface];
}

function hasEnvEvidence(focus: PatchPreflightFocus): boolean {
  return ENV_PATTERN.test(`${focus.target} ${focus.reason} ${focus.suggestedAction}`) &&
    /\b(missing|not defined|undefined|env|shim|polyfill|global|document|window|navigator|crypto|TextEncoder|TextDecoder)\b/i.test(`${focus.reason} ${focus.suggestedAction}`);
}

function extractTarget(value: string): string {
  const path = /\$[.\w[\]-]+/.exec(value);
  if (path?.[0]) {
    return path[0];
  }
  const signal = /\b(x-?sign|signature|sign|access[_-]?token|token|authorization|auth|nonce|challenge|verify|captcha|fingerprint|timestamp|ts|window|document|navigator|crypto|TextEncoder|TextDecoder)\b/i.exec(value);
  if (signal?.[1]) {
    return signal[1];
  }
  return value.trim().slice(0, 100) || 'unknown-target';
}

function uniqueStrings(values: readonly string[], limit: number): string[] {
  return Array.from(new Set(values.filter(Boolean))).slice(0, limit);
}

function clamp(value: number): number {
  return Math.max(0.05, Math.min(0.98, value));
}
