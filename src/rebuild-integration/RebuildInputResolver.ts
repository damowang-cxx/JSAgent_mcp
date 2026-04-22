import { AppError } from '../core/errors.js';
import type { DebuggerEvidenceCorrelator } from '../debugger/DebuggerEvidenceCorrelator.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { FixtureCandidateRegistry } from '../fixture/FixtureCandidateRegistry.js';
import type { StoredFixtureCandidate } from '../fixture/types.js';
import type { HelperBoundaryRegistry } from '../helper/HelperBoundaryRegistry.js';
import type { StoredHelperBoundary } from '../helper/types.js';
import type { ScenarioPatchHintRegistry } from '../patch/ScenarioPatchHintRegistry.js';
import type { StoredScenarioPatchHintSet } from '../patch/types.scenario.js';
import type { PatchPreflightRegistry } from '../patch-preflight/PatchPreflightRegistry.js';
import type { StoredPatchPreflightSnapshot } from '../patch-preflight/types.js';
import type { DivergenceComparator } from '../rebuild/DivergenceComparator.js';
import type { RebuildBundleExporter } from '../rebuild/RebuildBundleExporter.js';
import type { RebuildRunner } from '../rebuild/RebuildRunner.js';
import type { RebuildWorkflowResult } from '../rebuild/types.js';
import type { CompareAnchorRegistry } from '../compare/CompareAnchorRegistry.js';
import type { StoredCompareAnchorSnapshot } from '../compare/types.js';
import type { TaskManifestManager } from '../task/TaskManifestManager.js';
import type { RebuildWorkflowRunner } from '../workflow/RebuildWorkflowRunner.js';
import type { DependencyWindowRegistry } from '../window/DependencyWindowRegistry.js';
import type { StoredDependencyWindow } from '../window/types.js';
import type { RebuildContext, RebuildInputSource } from './types.js';

interface RebuildInputResolverDeps {
  fixtureCandidateRegistry: FixtureCandidateRegistry;
  dependencyWindowRegistry: DependencyWindowRegistry;
  compareAnchorRegistry: CompareAnchorRegistry;
  patchPreflightRegistry: PatchPreflightRegistry;
  scenarioPatchHintRegistry: ScenarioPatchHintRegistry;
  helperBoundaryRegistry: HelperBoundaryRegistry;
  debuggerEvidenceCorrelator: DebuggerEvidenceCorrelator;
  rebuildWorkflowRunner: RebuildWorkflowRunner;
  rebuildBundleExporter: RebuildBundleExporter;
  rebuildRunner: RebuildRunner;
  divergenceComparator: DivergenceComparator;
  evidenceStore: EvidenceStore;
  taskManifestManager: TaskManifestManager;
}

interface RebuildResolverContext {
  fixture?: StoredFixtureCandidate['result'] | null;
  dependencyWindow?: StoredDependencyWindow['result'] | null;
  compareAnchor?: StoredCompareAnchorSnapshot['result'] | null;
  patchPreflight?: StoredPatchPreflightSnapshot['result'] | null;
  patchHints?: StoredScenarioPatchHintSet['result'] | null;
  helperBoundary?: StoredHelperBoundary['result'] | null;
  rebuild?: RebuildWorkflowResult | null;
  debuggerHintCount?: number;
  notes: string[];
}

export class RebuildInputResolver {
  constructor(private readonly deps: RebuildInputResolverDeps) {}

  async resolve(options: {
    taskId?: string;
    source?: 'runtime-last' | 'task-artifact';
    targetUrl?: string;
  } = {}): Promise<RebuildContext> {
    if (options.source === 'task-artifact' && !options.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'prepare_rebuild_context with source=task-artifact requires taskId.');
    }

    const context = options.source === 'task-artifact'
      ? await this.readTaskContext(options.taskId as string)
      : await this.readRuntimeContext(options.targetUrl);

    const fixtureSource = this.resolveFixtureSource(context);
    const usedBoundaryFixture = context.fixture
      ? {
          fixtureId: context.fixture.fixtureId,
          targetName: context.fixture.targetName
        }
      : null;
    const selectedAnchor = context.compareAnchor?.selected ?? null;
    const usedCompareAnchor = selectedAnchor
      ? {
          anchorId: selectedAnchor.anchorId,
          compareStrategy: selectedAnchor.compareStrategy,
          kind: selectedAnchor.kind,
          label: selectedAnchor.label
        }
      : null;
    const selectedPreflight = context.patchPreflight?.selected ?? null;
    const usedPatchPreflight = selectedPreflight
      ? {
          surface: selectedPreflight.surface,
          target: selectedPreflight.target
        }
      : null;

    const result: RebuildContext = {
      contextId: makeContextId(
        usedBoundaryFixture?.targetName ??
          selectedAnchor?.label ??
          context.dependencyWindow?.targetName ??
          selectedPreflight?.target ??
          'rebuild-context'
      ),
      excludedNoise: this.buildExcludedNoise(context),
      expectedOutputs: this.buildExpectedOutputs(context),
      fixtureSource,
      nextActions: this.buildNextActions(context, fixtureSource, selectedAnchor?.label ?? null, selectedPreflight?.surface ?? null),
      preservedInputs: this.buildPreservedInputs(context),
      rebuildNotes: this.buildNotes(context, fixtureSource),
      stopIf: this.buildStopIf(context, fixtureSource),
      usedBoundaryFixture,
      usedCompareAnchor,
      usedPatchPreflight
    };

    return {
      ...result,
      expectedOutputs: uniqueBy(result.expectedOutputs, (item) => `${item.target}:${item.name}`).slice(0, 30),
      preservedInputs: uniqueBy(result.preservedInputs, (item) => item.name).slice(0, 30),
      excludedNoise: uniqueStrings(result.excludedNoise, 40),
      rebuildNotes: uniqueStrings(result.rebuildNotes, 40),
      nextActions: uniqueStrings(result.nextActions, 12),
      stopIf: uniqueStrings(result.stopIf, 12)
    };
  }

  private async readRuntimeContext(targetUrl: string | undefined): Promise<RebuildResolverContext> {
    const notes = ['Runtime source enabled; latest in-memory reverse artifacts were used.'];
    let debuggerHintCount = 0;
    try {
      debuggerHintCount = (await this.deps.debuggerEvidenceCorrelator.correlatePausedState({ targetUrl, maxHints: 6 })).length;
      if (debuggerHintCount > 0) {
        notes.push(`Debugger paused evidence contributed ${debuggerHintCount} enhancer hint(s); it was not used as the sole rebuild source.`);
      }
    } catch {
      notes.push('Debugger enhancer evidence was unavailable and was skipped.');
    }

    return {
      compareAnchor: this.deps.compareAnchorRegistry.getLast(),
      debuggerHintCount,
      dependencyWindow: this.deps.dependencyWindowRegistry.getLast(),
      fixture: this.deps.fixtureCandidateRegistry.getLast(),
      helperBoundary: this.deps.helperBoundaryRegistry.getLast(),
      notes,
      patchHints: this.deps.scenarioPatchHintRegistry.getLast(),
      patchPreflight: this.deps.patchPreflightRegistry.getLast(),
      rebuild: this.deps.rebuildWorkflowRunner.getLastRebuildWorkflowResult()
    };
  }

  private async readTaskContext(taskId: string): Promise<RebuildResolverContext> {
    await this.deps.taskManifestManager.ensureTask(taskId);
    const [fixture, dependencyWindow, compareAnchor, patchPreflight, patchHints, helperBoundary, rebuild] = await Promise.all([
      this.readStoredResult<StoredFixtureCandidate>(taskId, 'boundary-fixture/latest'),
      this.readStoredResult<StoredDependencyWindow>(taskId, 'dependency-window/latest'),
      this.readStoredResult<StoredCompareAnchorSnapshot>(taskId, 'compare-anchor/latest'),
      this.readStoredResult<StoredPatchPreflightSnapshot>(taskId, 'patch-preflight/latest'),
      this.readStoredResult<StoredScenarioPatchHintSet>(taskId, 'scenario-patch-hints/latest'),
      this.readStoredResult<StoredHelperBoundary>(taskId, 'helper-boundary/latest'),
      this.readSnapshot<RebuildWorkflowResult>(taskId, 'rebuild-workflow')
    ]);

    return {
      compareAnchor,
      dependencyWindow,
      fixture,
      helperBoundary,
      notes: [`Task artifact source enabled for ${taskId}; runtime caches were not used.`],
      patchHints,
      patchPreflight,
      rebuild
    };
  }

  private resolveFixtureSource(context: RebuildResolverContext): RebuildInputSource {
    if (context.fixture) {
      return 'boundary-fixture';
    }
    if (context.dependencyWindow) {
      return 'dependency-window';
    }
    if (context.compareAnchor?.selected) {
      return 'compare-anchor';
    }
    if (context.patchPreflight?.selected) {
      return 'patch-preflight';
    }
    if (context.patchHints) {
      return 'scenario-patch-hints';
    }
    if (context.rebuild?.fixture) {
      return 'generic-fixture';
    }
    return 'unknown';
  }

  private buildExpectedOutputs(context: RebuildResolverContext): RebuildContext['expectedOutputs'] {
    const outputs: RebuildContext['expectedOutputs'] = [];

    for (const output of context.fixture?.expectedOutputs ?? []) {
      outputs.push({
        name: output.name,
        reason: `Boundary fixture expected output: ${output.reason}`,
        target: output.target
      });
    }

    const anchor = context.compareAnchor?.selected;
    if (anchor) {
      outputs.push({
        name: anchor.path ?? anchor.label,
        reason: `Compare anchor selected ${anchor.label} because ${anchor.reason}`,
        target: anchor.kind
      });
    }

    for (const output of context.dependencyWindow?.outputs ?? []) {
      outputs.push({
        name: output.name,
        reason: `Dependency window output: ${output.reason}`,
        target: output.target
      });
    }

    const focus = context.patchPreflight?.selected;
    if (focus) {
      outputs.push({
        name: focus.target,
        reason: `Patch preflight selected ${focus.surface}: ${focus.reason}`,
        target: focus.surface
      });
    }

    for (const output of context.helperBoundary?.outputs ?? []) {
      outputs.push({
        name: output.name,
        reason: `Helper boundary output: ${output.reason}`,
        target: output.target
      });
    }

    return outputs;
  }

  private buildPreservedInputs(context: RebuildResolverContext): RebuildContext['preservedInputs'] {
    const inputs: RebuildContext['preservedInputs'] = [];

    for (const input of context.fixture?.inputs ?? []) {
      inputs.push({
        name: input.name,
        preserveFreshness: input.preserveFreshness,
        reason: `Boundary fixture input from ${input.source}: ${input.reason}`
      });
    }

    for (const input of context.dependencyWindow?.inputs ?? []) {
      inputs.push({
        name: input.name,
        preserveFreshness: input.preserveAsExternal || FRESHNESS_PATTERN.test(input.name),
        reason: `Dependency window input from ${input.source}: ${input.reason}`
      });
    }

    for (const input of context.helperBoundary?.inputs ?? []) {
      inputs.push({
        name: input.name,
        preserveFreshness: FRESHNESS_PATTERN.test(input.name),
        reason: `Helper boundary input from ${input.source}: ${input.reason}`
      });
    }

    const focus = context.patchPreflight?.selected;
    if (focus?.surface === 'fixture-input') {
      inputs.push({
        name: focus.target,
        preserveFreshness: true,
        reason: `Patch preflight requires fixture input focus: ${focus.reason}`
      });
    }

    return inputs;
  }

  private buildExcludedNoise(context: RebuildResolverContext): string[] {
    const values = [
      ...(context.fixture?.excludedNoise ?? []),
      ...(context.dependencyWindow?.excludedNoise ?? []),
      ...(context.patchPreflight?.stopIf.filter((item) => /broad|whole|env|shim|noise/i.test(item)) ?? []),
      ...(context.compareAnchor?.stopIf.filter((item) => /whole|broad|generic/i.test(item)) ?? []),
      'Do not expand to broad browser/DOM emulation unless a concrete missing environment divergence proves it is required.'
    ];

    if (context.patchPreflight?.selected?.surface !== 'env-shim') {
      values.push('Broad env-shim work is excluded from the first rebuild pass; compare anchor and fixture inputs are higher priority.');
    }

    return values;
  }

  private buildNotes(context: RebuildResolverContext, fixtureSource: RebuildInputSource): string[] {
    const notes = [
      ...context.notes,
      `Resolved rebuild fixture source as ${fixtureSource}.`,
      context.fixture
        ? `Boundary fixture ${context.fixture.fixtureId} drives this rebuild context.`
        : 'No boundary fixture was available; resolver used the next smallest available reverse artifact.',
      context.compareAnchor?.selected
        ? `Compare anchor ${context.compareAnchor.selected.label} enters rebuild metadata for first-divergence comparison.`
        : 'No compare anchor was available; run select_compare_anchor before trusting broad rebuild comparison.',
      context.patchPreflight?.selected
        ? `Patch preflight ${context.patchPreflight.selected.surface}:${context.patchPreflight.selected.target} enters rebuild context.`
        : 'No patch preflight focus was available; run plan_patch_preflight before patch iteration.',
      context.debuggerHintCount && context.debuggerHintCount > 0
        ? 'Debugger evidence was consumed only as enhancer context; hooks/replay/boundary remain primary.'
        : 'Debugger evidence did not contribute to this rebuild context.'
    ];

    if (context.patchHints) {
      notes.push(`Scenario patch hints ${context.patchHints.setId} contributed rebuild-oriented guidance.`);
    }

    return notes;
  }

  private buildNextActions(
    context: RebuildResolverContext,
    fixtureSource: RebuildInputSource,
    anchorLabel: string | null,
    patchSurface: string | null
  ): string[] {
    const actions = [
      'Run run_rebuild_from_context to export a context-aware bundle and keep context provenance in the result.',
      anchorLabel
        ? `Compare the rebuild result first against ${anchorLabel}, not a whole-request or whole-object fallback.`
        : 'Run select_compare_anchor before interpreting rebuild divergence as a patch target.',
      patchSurface
        ? `Use patch preflight surface ${patchSurface} as the first patch context after rebuild comparison.`
        : 'Run plan_patch_preflight before starting patch iteration.'
    ];

    if (fixtureSource !== 'boundary-fixture') {
      actions.push('Generate a boundary fixture if the current context still relies on dependency-window or generic fixture fallback.');
    }

    if ((context.fixture?.expectedOutputs.length ?? 0) > 0) {
      actions.push('Use boundary fixture expected outputs as the first compare targets in rebuild reporting.');
    }

    return actions;
  }

  private buildStopIf(context: RebuildResolverContext, fixtureSource: RebuildInputSource): string[] {
    return [
      'Stop if no boundary fixture, compare anchor, dependency window, patch preflight, or scenario patch hint evidence exists.',
      fixtureSource === 'unknown'
        ? 'Stop before running rebuild from context because no usable reverse artifact was found.'
        : `Stop expanding rebuild inputs once ${fixtureSource} produces a stable compare anchor result.`,
      context.compareAnchor?.selected
        ? `Stop whole-object comparison until anchor ${context.compareAnchor.selected.label} is checked first.`
        : 'Stop if rebuild comparison would default to generic whole-object diff without selecting a compare anchor.',
      context.patchPreflight?.selected?.surface === 'env-shim'
        ? 'Stop env-shim expansion after the explicit missing environment contract is satisfied.'
        : 'Stop before broad env-shim patching unless rebuild divergence proves a concrete missing global or property.'
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

const FRESHNESS_PATTERN = /\b(timestamp|nonce|ts|_t|time|token|challenge|verify|captcha|fingerprint)\b/i;

function makeContextId(target: string): string {
  const safe = target.replace(/[^A-Za-z0-9_$.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'rebuild-context';
  return `${safe}-${Date.now().toString(36)}`;
}

function uniqueBy<T>(items: readonly T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = keyFn(item).toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}

function uniqueStrings(values: readonly string[], limit: number): string[] {
  return Array.from(new Set(values.filter(Boolean))).slice(0, limit);
}
