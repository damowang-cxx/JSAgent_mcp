import { AppError } from '../core/errors.js';
import type { AiAugmentationRegistry } from '../ai/AiAugmentationRegistry.js';
import type { AiAugmentationResult, StoredAiAugmentationSnapshot } from '../ai/types.js';
import type { BattlefieldSnapshotRegistryLike } from '../battlefield/lineage.js';
import { buildBattlefieldLineageContribution, readBattlefieldLineageSnapshot, uniqueStrings as uniqueBattlefieldStrings } from '../battlefield/lineage.js';
import type { BaselineRegistry } from '../regression/BaselineRegistry.js';
import type { CompareAnchorRegistry } from '../compare/CompareAnchorRegistry.js';
import type { CompareAnchorSelectionResult, StoredCompareAnchorSnapshot } from '../compare/types.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { FlowReasoningRegistry } from '../flow/FlowReasoningRegistry.js';
import type { PatchPreflightRegistry } from '../patch-preflight/PatchPreflightRegistry.js';
import type { PatchPreflightResult, StoredPatchPreflightSnapshot } from '../patch-preflight/types.js';
import type { PurePreflightRegistry } from '../pure-preflight/PurePreflightRegistry.js';
import type { PurePreflightContext, StoredPurePreflightSnapshot } from '../pure-preflight/types.js';
import type { RebuildContextRegistry } from '../rebuild-integration/RebuildContextRegistry.js';
import type { RebuildContext, StoredRebuildContextSnapshot } from '../rebuild-integration/types.js';
import type { DeliveryAssembler } from '../sdk/DeliveryAssembler.js';
import type { SDKPackager } from '../sdk/SDKPackager.js';
import type { TaskManifestManager } from '../task/TaskManifestManager.js';
import type { DeliveryWorkflowRunner } from '../workflow/DeliveryWorkflowRunner.js';
import type { RegressionWorkflowRunner } from '../workflow/RegressionWorkflowRunner.js';
import type { DeliveryContextRegistry } from './DeliveryContextRegistry.js';
import type { RegressionContextResolver } from './RegressionContextResolver.js';
import type {
  DeliveryAiAugmentationSummary,
  DeliveryCompareAnchorSummary,
  DeliveryContext,
  DeliveryPatchPreflightSummary,
  DeliveryPurePreflightSummary,
  DeliveryRebuildContextSummary,
  RegressionContext,
  StoredRegressionContextSnapshot
} from './types.js';

interface DeliveryContextAssemblerDeps {
  compareAnchorRegistry: CompareAnchorRegistry;
  patchPreflightRegistry: PatchPreflightRegistry;
  rebuildContextRegistry: RebuildContextRegistry;
  flowReasoningRegistry: FlowReasoningRegistry;
  purePreflightRegistry: PurePreflightRegistry;
  aiAugmentationRegistry: AiAugmentationRegistry;
  baselineRegistry: BaselineRegistry;
  regressionWorkflowRunner: RegressionWorkflowRunner;
  deliveryWorkflowRunner: DeliveryWorkflowRunner;
  sdkPackager: SDKPackager;
  deliveryAssembler: DeliveryAssembler;
  regressionContextResolver: RegressionContextResolver;
  deliveryContextRegistry: DeliveryContextRegistry;
  evidenceStore: EvidenceStore;
  taskManifestManager: TaskManifestManager;
  battlefieldIntegrationRegistry?: BattlefieldSnapshotRegistryLike;
}

interface DeliveryContextEvidence {
  source: 'runtime-last' | 'task-artifact';
  taskId?: string;
  regressionContext: RegressionContext | null;
  compareAnchor: CompareAnchorSelectionResult | null;
  patchPreflight: PatchPreflightResult | null;
  rebuildContext: RebuildContext | null;
  purePreflight: PurePreflightContext | null;
  aiAugmentation: AiAugmentationResult | null;
  hasBaseline: boolean;
  hasDeliveryWorkflowResult: boolean;
  notes: string[];
}

export class DeliveryContextAssembler {
  constructor(private readonly deps: DeliveryContextAssemblerDeps) {}

  async assemble(options: {
    taskId?: string;
    source?: 'runtime-last' | 'task-artifact';
  } = {}): Promise<DeliveryContext> {
    if (options.source === 'task-artifact' && !options.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'prepare_delivery_context with source=task-artifact requires taskId.');
    }

    const evidence = options.source === 'task-artifact'
      ? await this.readTaskEvidence(options.taskId as string)
      : await this.readRuntimeEvidence(options.taskId);
    const compareAnchor = this.summarizeCompareAnchor(evidence.compareAnchor) ?? evidence.regressionContext?.compareAnchor ?? null;
    const patchPreflight = this.summarizePatchPreflight(evidence.patchPreflight) ?? evidence.regressionContext?.patchPreflight ?? null;
    const rebuildContext = this.summarizeRebuildContext(evidence.rebuildContext) ?? evidence.regressionContext?.rebuildContext ?? null;
    const purePreflight = this.summarizePurePreflight(evidence.purePreflight) ?? evidence.regressionContext?.purePreflight ?? null;
    const aiAugmentation = this.summarizeAiAugmentation(evidence.aiAugmentation);
    const battlefieldSnapshot = await readBattlefieldLineageSnapshot(this.deps.battlefieldIntegrationRegistry, {
      preferTaskArtifact: options.source === 'task-artifact',
      taskId: options.taskId
    });
    const battlefield = buildBattlefieldLineageContribution(battlefieldSnapshot, 'delivery context');

    const context: DeliveryContext = {
      aiAugmentation,
      compareAnchor,
      contextId: makeContextId(compareAnchor?.label ?? purePreflight?.contextId ?? evidence.regressionContext?.contextId ?? 'delivery-context'),
      handoffNotes: uniqueBattlefieldStrings([
        ...this.buildHandoffNotes(evidence, compareAnchor, patchPreflight, rebuildContext, purePreflight, aiAugmentation),
        ...battlefield.notes,
        ...battlefield.provenance
      ], 40),
      nextActions: uniqueBattlefieldStrings([
        ...this.buildNextActions(evidence, compareAnchor, patchPreflight, rebuildContext, purePreflight, aiAugmentation),
        ...battlefield.nextActions
      ], 16),
      patchPreflight,
      provenanceSummary: uniqueBattlefieldStrings([
        ...this.buildProvenanceSummary(evidence, compareAnchor, patchPreflight, rebuildContext, purePreflight, aiAugmentation),
        ...battlefield.provenance
      ], 30),
      purePreflight,
      rebuildContext,
      regressionContext: evidence.regressionContext,
      stopIf: uniqueBattlefieldStrings([
        ...this.buildStopIf(evidence, compareAnchor, patchPreflight, rebuildContext, purePreflight, aiAugmentation),
        ...battlefield.stopIf
      ], 16)
    };

    return {
      ...context,
      handoffNotes: uniqueStrings(context.handoffNotes, 40),
      nextActions: uniqueStrings(context.nextActions, 16),
      provenanceSummary: uniqueStrings(context.provenanceSummary, 30),
      stopIf: uniqueStrings(context.stopIf, 16)
    };
  }

  private async readRuntimeEvidence(taskId: string | undefined): Promise<DeliveryContextEvidence> {
    const cachedRegressionContext = this.deps.deliveryContextRegistry.getLastRegressionContext();
    const regressionContext = cachedRegressionContext ??
      await this.deps.regressionContextResolver.resolve({
        source: 'runtime-last',
        taskId
      });

    return {
      aiAugmentation: this.deps.aiAugmentationRegistry.getLast(),
      compareAnchor: this.deps.compareAnchorRegistry.getLast(),
      hasBaseline: Boolean(taskId ? await this.deps.baselineRegistry.getLatest(taskId).catch(() => null) : regressionContext?.baselineId),
      hasDeliveryWorkflowResult: Boolean(this.deps.deliveryWorkflowRunner.getLastDeliveryWorkflowResult()),
      notes: [
        'Runtime source enabled; latest in-memory regression and reverse provenance were used for delivery context.',
        'Delivery gates and regression match remain deterministic; AI is handoff explanation only.'
      ],
      patchPreflight: this.deps.patchPreflightRegistry.getLast(),
      purePreflight: this.deps.purePreflightRegistry.getLast(),
      rebuildContext: this.deps.rebuildContextRegistry.getLast(),
      regressionContext,
      source: 'runtime-last'
    };
  }

  private async readTaskEvidence(taskId: string): Promise<DeliveryContextEvidence> {
    await this.deps.taskManifestManager.ensureTask(taskId);
    const [storedRegressionContext, compareAnchor, patchPreflight, rebuildContext, purePreflight, aiAugmentation, baseline] =
      await Promise.all([
        this.readStoredSnapshot<StoredRegressionContextSnapshot>(taskId, 'regression-context/latest'),
        this.readStoredResult<StoredCompareAnchorSnapshot>(taskId, 'compare-anchor/latest'),
        this.readStoredResult<StoredPatchPreflightSnapshot>(taskId, 'patch-preflight/latest'),
        this.readStoredResult<StoredRebuildContextSnapshot>(taskId, 'rebuild-context/latest'),
        this.readStoredResult<StoredPurePreflightSnapshot>(taskId, 'pure-preflight/latest'),
        this.readStoredResult<StoredAiAugmentationSnapshot>(taskId, 'ai-augmentation/latest'),
        this.deps.baselineRegistry.getLatest(taskId).catch(() => null)
      ]);
    const regressionContext = storedRegressionContext?.result ??
      await this.deps.regressionContextResolver.resolve({
        source: 'task-artifact',
        taskId
      });

    return {
      aiAugmentation,
      compareAnchor,
      hasBaseline: Boolean(baseline),
      hasDeliveryWorkflowResult: Boolean(await this.readSnapshot<unknown>(taskId, 'delivery/workflow-result')),
      notes: [
        `Task artifact source enabled for ${taskId}; runtime caches were not used.`,
        'Delivery context was assembled from persisted reverse, regression, pure, and AI augmentation artifacts.'
      ],
      patchPreflight,
      purePreflight,
      rebuildContext,
      regressionContext,
      source: 'task-artifact',
      taskId
    };
  }

  private summarizeCompareAnchor(result: CompareAnchorSelectionResult | null): DeliveryCompareAnchorSummary | null {
    const selected = result?.selected;
    return selected
      ? {
          anchorId: selected.anchorId,
          kind: selected.kind,
          label: selected.label
        }
      : null;
  }

  private summarizePatchPreflight(result: PatchPreflightResult | null): DeliveryPatchPreflightSummary | null {
    const selected = result?.selected;
    return selected
      ? {
          surface: selected.surface,
          target: selected.target
        }
      : null;
  }

  private summarizeRebuildContext(result: RebuildContext | null): DeliveryRebuildContextSummary | null {
    return result
      ? {
          contextId: result.contextId,
          fixtureSource: result.fixtureSource
        }
      : null;
  }

  private summarizePurePreflight(result: PurePreflightContext | null): DeliveryPurePreflightSummary | null {
    return result
      ? {
          contextId: result.contextId,
          source: result.source
        }
      : null;
  }

  private summarizeAiAugmentation(result: AiAugmentationResult | null): DeliveryAiAugmentationSummary | null {
    return result
      ? {
          augmentationId: result.augmentationId,
          mode: result.mode,
          providerAvailable: result.providerAvailable
        }
      : null;
  }

  private buildHandoffNotes(
    evidence: DeliveryContextEvidence,
    compareAnchor: DeliveryCompareAnchorSummary | null,
    patchPreflight: DeliveryPatchPreflightSummary | null,
    rebuildContext: DeliveryRebuildContextSummary | null,
    purePreflight: DeliveryPurePreflightSummary | null,
    aiAugmentation: DeliveryAiAugmentationSummary | null
  ): string[] {
    return [
      ...evidence.notes,
      evidence.regressionContext
        ? `Regression context ${evidence.regressionContext.contextId} is included as delivery provenance.`
        : 'No regression context was available; prepare_regression_context should run before handoff.',
      evidence.hasBaseline
        ? 'A regression baseline is available as deterministic delivery provenance.'
        : 'No regression baseline was found; delivery handoff should stop before packaging.',
      compareAnchor
        ? `Compare anchor ${compareAnchor.label} is included for first-divergence review.`
        : 'No compare anchor is included in this delivery context.',
      patchPreflight
        ? `Patch preflight ${patchPreflight.surface}:${patchPreflight.target} is included for maintenance triage.`
        : 'No patch preflight focus is included in this delivery context.',
      rebuildContext
        ? `Rebuild context ${rebuildContext.contextId} is included for reverse-to-rebuild provenance.`
        : 'No rebuild context is included in this delivery context.',
      purePreflight
        ? `Pure preflight ${purePreflight.contextId} is included for reverse-to-pure provenance.`
        : 'No pure preflight is included in this delivery context.',
      aiAugmentation
        ? `AI augmentation ${aiAugmentation.augmentationId} is included as handoff readability enhancer only.`
        : 'No AI augmentation is included; deterministic handoff remains valid if gates pass.',
      evidence.hasDeliveryWorkflowResult
        ? 'A previous delivery workflow result exists; refresh it after context changes.'
        : 'No previous delivery workflow result was found for this context.'
    ];
  }

  private buildProvenanceSummary(
    evidence: DeliveryContextEvidence,
    compareAnchor: DeliveryCompareAnchorSummary | null,
    patchPreflight: DeliveryPatchPreflightSummary | null,
    rebuildContext: DeliveryRebuildContextSummary | null,
    purePreflight: DeliveryPurePreflightSummary | null,
    aiAugmentation: DeliveryAiAugmentationSummary | null
  ): string[] {
    return [
      `Source: ${evidence.source}.`,
      evidence.regressionContext
        ? `Regression context: ${evidence.regressionContext.contextId}.`
        : 'Regression context: missing.',
      compareAnchor
        ? `Compare anchor: ${compareAnchor.anchorId} (${compareAnchor.kind}:${compareAnchor.label}).`
        : 'Compare anchor: missing.',
      patchPreflight
        ? `Patch preflight: ${patchPreflight.surface}:${patchPreflight.target}.`
        : 'Patch preflight: missing.',
      rebuildContext
        ? `Rebuild context: ${rebuildContext.contextId} from ${rebuildContext.fixtureSource}.`
        : 'Rebuild context: missing.',
      purePreflight
        ? `Pure preflight: ${purePreflight.contextId} from ${purePreflight.source}.`
        : 'Pure preflight: missing.',
      aiAugmentation
        ? `AI augmentation: ${aiAugmentation.augmentationId}, providerAvailable=${aiAugmentation.providerAvailable}.`
        : 'AI augmentation: missing or skipped.',
      'Delivery readiness and regression matching remain deterministic and are not decided by AI.'
    ];
  }

  private buildNextActions(
    evidence: DeliveryContextEvidence,
    compareAnchor: DeliveryCompareAnchorSummary | null,
    patchPreflight: DeliveryPatchPreflightSummary | null,
    rebuildContext: DeliveryRebuildContextSummary | null,
    purePreflight: DeliveryPurePreflightSummary | null,
    aiAugmentation: DeliveryAiAugmentationSummary | null
  ): string[] {
    return [
      evidence.regressionContext
        ? `Run run_delivery_from_context with regression context ${evidence.regressionContext.contextId}.`
        : 'Run prepare_regression_context before delivery workflow.',
      compareAnchor
        ? `Keep delivery drift review anchored on ${compareAnchor.label}.`
        : 'Run select_compare_anchor before final handoff if first divergence is not explainable.',
      patchPreflight
        ? `Document patch preflight focus ${patchPreflight.surface}:${patchPreflight.target} in handoff notes.`
        : 'Run plan_patch_preflight before delivery if maintenance focus is missing.',
      rebuildContext
        ? `Carry rebuild context ${rebuildContext.contextId} into delivery report snapshots.`
        : 'Run prepare_rebuild_context before delivery report export.',
      purePreflight
        ? `Carry pure preflight ${purePreflight.contextId} into delivery report snapshots.`
        : 'Run plan_pure_preflight before final delivery handoff.',
      aiAugmentation
        ? 'Use AI augmentation text only as a human-readable report block.'
        : 'Run explain_reverse_context_with_ai if a readable handoff explanation is useful.',
      'Run deterministic delivery workflow after context preparation; do not let AI decide readyForDelivery.'
    ];
  }

  private buildStopIf(
    evidence: DeliveryContextEvidence,
    compareAnchor: DeliveryCompareAnchorSummary | null,
    patchPreflight: DeliveryPatchPreflightSummary | null,
    rebuildContext: DeliveryRebuildContextSummary | null,
    purePreflight: DeliveryPurePreflightSummary | null,
    aiAugmentation: DeliveryAiAugmentationSummary | null
  ): string[] {
    return [
      evidence.hasBaseline
        ? 'Stop refreshing the registered baseline unless acceptance confirms changed behavior.'
        : 'Stop delivery because no regression baseline exists.',
      evidence.regressionContext
        ? 'Stop if regression context and latest regression run disagree on baseline or first divergence.'
        : 'Stop delivery because regression context is missing.',
      compareAnchor
        ? `Stop broad output handoff until compare anchor ${compareAnchor.label} is included.`
        : 'Stop if no compare anchor or first explainable divergence is present.',
      patchPreflight
        ? `Stop maintenance handoff if patch focus ${patchPreflight.surface}:${patchPreflight.target} is stale.`
        : 'Stop if patch preflight has not narrowed the maintenance focus.',
      rebuildContext && purePreflight
        ? 'Stop if rebuild context and pure preflight provenance conflict; resolve deterministic artifacts first.'
        : 'Stop final handoff until rebuild and pure preflight context exist.',
      aiAugmentation
        ? 'Stop using AI wording if it conflicts with deterministic compare, patch, rebuild, pure, regression, or delivery artifacts.'
        : 'Stop treating missing AI as a blocker; AI is optional and not delivery truth.'
    ];
  }

  private async readSnapshot<T>(taskId: string, name: string): Promise<T | null> {
    try {
      const snapshot = await this.deps.evidenceStore.readSnapshot(taskId, name);
      return snapshot ? snapshot as T : null;
    } catch {
      return null;
    }
  }

  private async readStoredSnapshot<T>(taskId: string, name: string): Promise<T | null> {
    return await this.readSnapshot<T>(taskId, name);
  }

  private async readStoredResult<T extends { result: unknown }>(taskId: string, name: string): Promise<T['result'] | null> {
    const snapshot = await this.readSnapshot<T>(taskId, name);
    return snapshot?.result ?? null;
  }
}

function makeContextId(seed: string): string {
  const safe = seed.replace(/[^A-Za-z0-9_$.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'delivery-context';
  return `${safe}-${Date.now().toString(36)}`;
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
