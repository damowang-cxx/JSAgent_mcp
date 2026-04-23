import { AppError } from '../core/errors.js';
import type { CompareAnchorRegistry } from '../compare/CompareAnchorRegistry.js';
import type { CompareAnchorSelectionResult, StoredCompareAnchorSnapshot } from '../compare/types.js';
import type { BattlefieldSnapshotRegistryLike } from '../battlefield/lineage.js';
import { buildBattlefieldLineageContribution, readBattlefieldLineageSnapshot, uniqueStrings as uniqueBattlefieldStrings } from '../battlefield/lineage.js';
import type { DebuggerEvidenceCorrelator } from '../debugger/DebuggerEvidenceCorrelator.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { FixtureCandidateRegistry } from '../fixture/FixtureCandidateRegistry.js';
import type { FixtureCandidateResult, StoredFixtureCandidate } from '../fixture/types.js';
import type { FlowReasoningRegistry } from '../flow/FlowReasoningRegistry.js';
import type { FlowReasoningResult, StoredFlowReasoningSnapshot } from '../flow/types.js';
import type { HelperBoundaryRegistry } from '../helper/HelperBoundaryRegistry.js';
import type { HelperBoundaryResult, StoredHelperBoundary } from '../helper/types.js';
import type { PatchPreflightRegistry } from '../patch-preflight/PatchPreflightRegistry.js';
import type { PatchPreflightResult, StoredPatchPreflightSnapshot } from '../patch-preflight/types.js';
import type { RebuildContextRegistry } from '../rebuild-integration/RebuildContextRegistry.js';
import type { RebuildContext, StoredRebuildContextSnapshot } from '../rebuild-integration/types.js';
import type { RebuildWorkflowRunner } from '../workflow/RebuildWorkflowRunner.js';
import type { PureExtractionRunner } from '../workflow/PureExtractionRunner.js';
import type { TaskManifestManager } from '../task/TaskManifestManager.js';
import type { DependencyWindowRegistry } from '../window/DependencyWindowRegistry.js';
import type { DependencyWindowResult, StoredDependencyWindow } from '../window/types.js';
import type { PurePreflightContext, PurePreflightSource } from './types.js';

interface PurePreflightPlannerDeps {
  fixtureCandidateRegistry: FixtureCandidateRegistry;
  dependencyWindowRegistry: DependencyWindowRegistry;
  compareAnchorRegistry: CompareAnchorRegistry;
  patchPreflightRegistry: PatchPreflightRegistry;
  rebuildContextRegistry: RebuildContextRegistry;
  flowReasoningRegistry: FlowReasoningRegistry;
  helperBoundaryRegistry: HelperBoundaryRegistry;
  debuggerEvidenceCorrelator: DebuggerEvidenceCorrelator;
  pureExtractionRunner: PureExtractionRunner;
  rebuildWorkflowRunner: RebuildWorkflowRunner;
  evidenceStore: EvidenceStore;
  taskManifestManager: TaskManifestManager;
  battlefieldIntegrationRegistry?: BattlefieldSnapshotRegistryLike;
}

interface PurePreflightEvidence {
  source: 'runtime-last' | 'task-artifact';
  taskId?: string;
  fixture: FixtureCandidateResult | null;
  dependencyWindow: DependencyWindowResult | null;
  compareAnchor: CompareAnchorSelectionResult | null;
  patchPreflight: PatchPreflightResult | null;
  rebuildContext: RebuildContext | null;
  flowReasoning: FlowReasoningResult | null;
  helperBoundary: HelperBoundaryResult | null;
  debuggerHintCount: number;
  hasPureResult: boolean;
  hasRebuildResult: boolean;
  notes: string[];
}

const FRESHNESS_PATTERN = /\b(timestamp|nonce|ts|_t|time|token|challenge|verify|captcha|fingerprint|auth|authorization)\b/i;
const NOISE_PATTERN = /\b(broad|whole|browser|dom|env-shim|noise|debugger|target-chain|breakpoint)\b/i;

export class PurePreflightPlanner {
  constructor(private readonly deps: PurePreflightPlannerDeps) {}

  async plan(options: {
    taskId?: string;
    source?: 'runtime-last' | 'task-artifact';
    targetUrl?: string;
  } = {}): Promise<PurePreflightContext> {
    if (options.source === 'task-artifact' && !options.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'plan_pure_preflight with source=task-artifact requires taskId.');
    }

    const evidence = options.source === 'task-artifact'
      ? await this.readTaskEvidence(options.taskId as string)
      : await this.readRuntimeEvidence(options.targetUrl);
    const selectedAnchor = evidence.compareAnchor?.selected ?? null;
    const selectedPreflight = evidence.patchPreflight?.selected ?? null;
    const source = this.resolveSource(evidence);
    const usedBoundaryFixture = evidence.fixture
      ? {
          fixtureId: evidence.fixture.fixtureId,
          targetName: evidence.fixture.targetName
        }
      : null;
    const usedCompareAnchor = selectedAnchor
      ? {
          anchorId: selectedAnchor.anchorId,
          kind: selectedAnchor.kind,
          label: selectedAnchor.label
        }
      : null;
    const usedPatchPreflight = selectedPreflight
      ? {
          surface: selectedPreflight.surface,
          target: selectedPreflight.target
        }
      : null;
    const usedRebuildContext = evidence.rebuildContext
      ? {
          contextId: evidence.rebuildContext.contextId,
          fixtureSource: evidence.rebuildContext.fixtureSource
        }
      : null;
    const usedFlowReasoning = evidence.flowReasoning
      ? {
          resultId: evidence.flowReasoning.resultId,
          targetName: evidence.flowReasoning.targetName
        }
      : null;
    const battlefieldSnapshot = await readBattlefieldLineageSnapshot(this.deps.battlefieldIntegrationRegistry, {
      preferTaskArtifact: options.source === 'task-artifact',
      taskId: options.taskId
    });
    const battlefield = buildBattlefieldLineageContribution(battlefieldSnapshot, 'pure preflight');

    const targetName = usedBoundaryFixture?.targetName ??
      usedFlowReasoning?.targetName ??
      usedCompareAnchor?.label ??
      evidence.dependencyWindow?.targetName ??
      evidence.helperBoundary?.helperName ??
      usedPatchPreflight?.target ??
      'pure-preflight';
    const context: PurePreflightContext = {
      contextId: makeContextId(targetName),
      excludedNoise: uniqueStrings(this.buildExcludedNoise(evidence), 50),
      expectedOutputs: uniqueBy(this.buildExpectedOutputs(evidence), (item) => `${item.target}:${item.name}`).slice(0, 40),
      nextActions: uniqueBattlefieldStrings([...this.buildNextActions(evidence, source), ...battlefield.nextActions], 16),
      preservedInputs: uniqueBy(this.buildPreservedInputs(evidence), (item) => item.name).slice(0, 40),
      pureNotes: uniqueBattlefieldStrings([...this.buildPureNotes(evidence, source), ...battlefield.notes], 50),
      source,
      stopIf: uniqueBattlefieldStrings([...this.buildStopIf(evidence, source), ...battlefield.stopIf], 16),
      usedBoundaryFixture,
      usedCompareAnchor,
      usedFlowReasoning,
      usedPatchPreflight,
      usedRebuildContext
    };

    return context;
  }

  private async readRuntimeEvidence(targetUrl: string | undefined): Promise<PurePreflightEvidence> {
    const notes = ['Runtime source enabled; latest in-memory reverse artifacts were used for pure preflight.'];
    let debuggerHintCount = 0;
    try {
      debuggerHintCount = (await this.deps.debuggerEvidenceCorrelator.correlatePausedState({ targetUrl, maxHints: 6 })).length;
      if (debuggerHintCount > 0) {
        notes.push(`Debugger enhancer contributed ${debuggerHintCount} hint(s); hooks/replay/boundary remain primary pure evidence.`);
      }
    } catch {
      notes.push('Debugger enhancer evidence was unavailable and was skipped.');
    }

    return {
      compareAnchor: this.deps.compareAnchorRegistry.getLast(),
      debuggerHintCount,
      dependencyWindow: this.deps.dependencyWindowRegistry.getLast(),
      fixture: this.deps.fixtureCandidateRegistry.getLast(),
      flowReasoning: this.deps.flowReasoningRegistry.getLast(),
      hasPureResult: Boolean(this.deps.pureExtractionRunner.getLastPureExtractionResult()),
      hasRebuildResult: Boolean(this.deps.rebuildWorkflowRunner.getLastRebuildWorkflowResult()),
      helperBoundary: this.deps.helperBoundaryRegistry.getLast(),
      notes,
      patchPreflight: this.deps.patchPreflightRegistry.getLast(),
      rebuildContext: this.deps.rebuildContextRegistry.getLast(),
      source: 'runtime-last'
    };
  }

  private async readTaskEvidence(taskId: string): Promise<PurePreflightEvidence> {
    await this.deps.taskManifestManager.ensureTask(taskId);
    const [fixture, dependencyWindow, compareAnchor, patchPreflight, rebuildContext, flowReasoning, helperBoundary, pureResult, rebuildResult] =
      await Promise.all([
        this.readStoredResult<StoredFixtureCandidate>(taskId, 'boundary-fixture/latest'),
        this.readStoredResult<StoredDependencyWindow>(taskId, 'dependency-window/latest'),
        this.readStoredResult<StoredCompareAnchorSnapshot>(taskId, 'compare-anchor/latest'),
        this.readStoredResult<StoredPatchPreflightSnapshot>(taskId, 'patch-preflight/latest'),
        this.readStoredResult<StoredRebuildContextSnapshot>(taskId, 'rebuild-context/latest'),
        this.readStoredResult<StoredFlowReasoningSnapshot>(taskId, 'flow-reasoning/latest'),
        this.readStoredResult<StoredHelperBoundary>(taskId, 'helper-boundary/latest'),
        this.readSnapshot<unknown>(taskId, 'run/pure-extraction'),
        this.readSnapshot<unknown>(taskId, 'rebuild-workflow')
      ]);

    return {
      compareAnchor,
      debuggerHintCount: 0,
      dependencyWindow,
      fixture,
      flowReasoning,
      hasPureResult: Boolean(pureResult),
      hasRebuildResult: Boolean(rebuildResult),
      helperBoundary,
      notes: [`Task artifact source enabled for ${taskId}; runtime caches were not used.`],
      patchPreflight,
      rebuildContext,
      source: 'task-artifact',
      taskId
    };
  }

  private resolveSource(evidence: PurePreflightEvidence): PurePreflightSource {
    if (evidence.fixture) {
      return 'boundary-fixture';
    }
    if (evidence.rebuildContext) {
      return 'rebuild-context';
    }
    if (evidence.compareAnchor?.selected) {
      return 'compare-anchor';
    }
    if (evidence.patchPreflight?.selected) {
      return 'patch-preflight';
    }
    if (evidence.flowReasoning) {
      return 'flow-reasoning';
    }
    if (evidence.dependencyWindow) {
      return 'dependency-window';
    }
    if (evidence.helperBoundary) {
      return 'helper-boundary';
    }
    if (evidence.hasPureResult) {
      return 'generic-pure';
    }
    return 'unknown';
  }

  private buildExpectedOutputs(evidence: PurePreflightEvidence): PurePreflightContext['expectedOutputs'] {
    const outputs: PurePreflightContext['expectedOutputs'] = [];

    for (const output of evidence.fixture?.expectedOutputs ?? []) {
      outputs.push({
        name: output.name,
        reason: `Boundary fixture expected output: ${output.reason}`,
        target: output.target
      });
    }

    for (const output of evidence.rebuildContext?.expectedOutputs ?? []) {
      outputs.push({
        name: output.name,
        reason: `Rebuild context expected output: ${output.reason}`,
        target: output.target
      });
    }

    const anchor = evidence.compareAnchor?.selected;
    if (anchor) {
      outputs.push({
        name: anchor.path ?? anchor.label,
        reason: `Compare anchor selected ${anchor.label} as first explainable pure output candidate: ${anchor.reason}`,
        target: anchor.kind
      });
    }

    const flow = evidence.flowReasoning;
    for (const value of flow?.requestFieldBindings.slice(0, 10) ?? []) {
      outputs.push({
        name: value,
        reason: 'Flow reasoning identified this request field binder as a pure expected-output candidate.',
        target: 'request-field'
      });
    }
    for (const value of flow?.helperConsumers.slice(0, 10) ?? []) {
      outputs.push({
        name: value,
        reason: 'Flow reasoning identified this helper return consumer as a pure expected-output candidate.',
        target: 'helper-return'
      });
    }

    for (const output of evidence.dependencyWindow?.outputs ?? []) {
      outputs.push({
        name: output.name,
        reason: `Dependency window output: ${output.reason}`,
        target: output.target
      });
    }

    for (const output of evidence.helperBoundary?.outputs ?? []) {
      outputs.push({
        name: output.name,
        reason: `Helper boundary output: ${output.reason}`,
        target: output.target
      });
    }

    return outputs;
  }

  private buildPreservedInputs(evidence: PurePreflightEvidence): PurePreflightContext['preservedInputs'] {
    const inputs: PurePreflightContext['preservedInputs'] = [];

    for (const input of evidence.fixture?.inputs ?? []) {
      inputs.push({
        name: input.name,
        preserveFreshness: input.preserveFreshness,
        reason: `Boundary fixture input from ${input.source}: ${input.reason}`
      });
    }

    for (const input of evidence.rebuildContext?.preservedInputs ?? []) {
      inputs.push({
        name: input.name,
        preserveFreshness: input.preserveFreshness,
        reason: `Rebuild context preserved input: ${input.reason}`
      });
    }

    for (const input of evidence.dependencyWindow?.inputs ?? []) {
      inputs.push({
        name: input.name,
        preserveFreshness: input.preserveAsExternal || FRESHNESS_PATTERN.test(input.name),
        reason: `Dependency window input from ${input.source}: ${input.reason}`
      });
    }

    for (const input of evidence.helperBoundary?.inputs ?? []) {
      inputs.push({
        name: input.name,
        preserveFreshness: FRESHNESS_PATTERN.test(input.name),
        reason: `Helper boundary input from ${input.source}: ${input.reason}`
      });
    }

    const focus = evidence.patchPreflight?.selected;
    if (focus?.surface === 'fixture-input') {
      inputs.push({
        name: focus.target,
        preserveFreshness: true,
        reason: `Patch preflight selected fixture input focus: ${focus.reason}`
      });
    }

    for (const binding of evidence.flowReasoning?.requestFieldBindings.slice(0, 12) ?? []) {
      if (FRESHNESS_PATTERN.test(binding)) {
        inputs.push({
          name: binding,
          preserveFreshness: true,
          reason: 'Flow reasoning found a freshness-sensitive request field binding.'
        });
      }
    }

    return inputs;
  }

  private buildExcludedNoise(evidence: PurePreflightEvidence): string[] {
    const values = [
      ...(evidence.fixture?.excludedNoise ?? []),
      ...(evidence.rebuildContext?.excludedNoise ?? []),
      ...(evidence.dependencyWindow?.excludedNoise ?? []),
      ...(evidence.patchPreflight?.stopIf.filter((item) => NOISE_PATTERN.test(item)) ?? []),
      ...(evidence.patchPreflight?.notes.filter((item) => NOISE_PATTERN.test(item)) ?? []),
      ...(evidence.flowReasoning?.notes.filter((item) => NOISE_PATTERN.test(item)) ?? []),
      'Do not pass broad browser, DOM layout, timing, random, or whole-request noise into pure input by default.',
      'Debugger evidence is enhancer-only and must not become the pure fixture truth source.'
    ];

    if (evidence.patchPreflight?.selected?.surface !== 'env-shim') {
      values.push('Broad env-shim state is excluded from the first pure pass unless rebuild divergence proves a concrete missing environment contract.');
    }

    return values;
  }

  private buildPureNotes(evidence: PurePreflightEvidence, source: PurePreflightSource): string[] {
    return [
      ...evidence.notes,
      `Resolved pure preflight source as ${source}.`,
      evidence.fixture
        ? `Boundary fixture ${evidence.fixture.fixtureId} provides the strongest pure input/output context.`
        : 'No boundary fixture was available; pure preflight used the next smallest reverse artifact.',
      evidence.rebuildContext
        ? `Rebuild context ${evidence.rebuildContext.contextId} contributes preserved inputs and expected outputs.`
        : 'No rebuild context was available; run prepare_rebuild_context before trusting pure inputs.',
      evidence.compareAnchor?.selected
        ? `Compare anchor ${evidence.compareAnchor.selected.label} is available as first explainable pure expected output.`
        : 'No compare anchor was available; pure output may be too broad.',
      evidence.patchPreflight?.selected
        ? `Patch preflight focus ${evidence.patchPreflight.selected.surface}:${evidence.patchPreflight.selected.target} narrows pure preflight.`
        : 'No patch preflight focus was available; run plan_patch_preflight before pure narrowing.',
      evidence.flowReasoning
        ? `Flow reasoning ${evidence.flowReasoning.resultId} contributes helper consumer and request binder enhancer evidence.`
        : 'No flow reasoning result was available; run analyze_flow_reasoning for helper/binder provenance.',
      evidence.debuggerHintCount > 0
        ? 'Debugger hints were consumed only as enhancer evidence; hook/replay/boundary evidence remains primary.'
        : 'Debugger enhancer evidence did not contribute to this pure preflight.'
    ];
  }

  private buildNextActions(evidence: PurePreflightEvidence, source: PurePreflightSource): string[] {
    const actions = [
      evidence.compareAnchor?.selected
        ? `Turn compare anchor ${evidence.compareAnchor.selected.label} into an explicit pure expected output before request-level output checks.`
        : 'Run select_compare_anchor before using pure output as a broad request-level oracle.',
      evidence.flowReasoning?.helperConsumers[0]
        ? `Validate helper return consumer ${evidence.flowReasoning.helperConsumers[0]} before expanding pure boundary inputs.`
        : 'Run trace_helper_consumers if helper return consumption is still implicit.',
      evidence.rebuildContext
        ? `Use rebuild context ${evidence.rebuildContext.contextId} preserved inputs as pure input provenance.`
        : 'Run prepare_rebuild_context so pure can consume reverse-to-rebuild provenance.',
      evidence.patchPreflight?.selected
        ? `Keep pure work aligned to patch preflight ${evidence.patchPreflight.selected.surface}:${evidence.patchPreflight.selected.target}.`
        : 'Run plan_patch_preflight before deciding whether pure or patch should move next.'
    ];

    if (!evidence.fixture) {
      actions.push('Generate a boundary fixture before treating pure extraction as ready for port.');
    }

    if (!evidence.hasRebuildResult && source !== 'boundary-fixture') {
      actions.push('Run or refresh rebuild before pure extraction if no first-divergence baseline exists.');
    }

    return actions;
  }

  private buildStopIf(evidence: PurePreflightEvidence, source: PurePreflightSource): string[] {
    return [
      'Stop if pure extraction would proceed without boundary fixture, rebuild context, compare anchor, patch preflight, flow reasoning, dependency window, or helper boundary evidence.',
      source === 'unknown'
        ? 'Stop before pure extraction because no reverse-to-pure context was found.'
        : `Stop widening pure input once ${source} provides stable expected output and preserved input coverage.`,
      evidence.compareAnchor?.selected
        ? `Stop whole-request pure comparison until anchor ${evidence.compareAnchor.selected.label} is checked first.`
        : 'Stop broad pure expected-output work until select_compare_anchor has a focused output.',
      evidence.patchPreflight?.selected?.surface === 'env-shim'
        ? 'Stop pure work and return to rebuild/patch if the current first divergence is a concrete env-shim gap.'
        : 'Stop before adding broad browser or DOM noise to pure input unless rebuild divergence proves it is required.',
      evidence.fixture
        ? 'Stop adding more fixture fields once boundary fixture expected outputs pass in Node pure verification.'
        : 'Stop readyForPort decisions until a boundary fixture or rebuild context is present.'
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

function makeContextId(target: string): string {
  const safe = target.replace(/[^A-Za-z0-9_$.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'pure-preflight';
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
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}
