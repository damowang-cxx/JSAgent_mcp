import { AppError } from '../core/errors.js';
import type { AiAugmentationRegistry } from '../ai/AiAugmentationRegistry.js';
import type { BaselineRegistry } from '../regression/BaselineRegistry.js';
import type { RegressionRunner } from '../regression/RegressionRunner.js';
import type { RegressionBaseline, RegressionRunResult } from '../regression/types.js';
import type { CompareAnchorRegistry } from '../compare/CompareAnchorRegistry.js';
import type { CompareAnchorSelectionResult, StoredCompareAnchorSnapshot } from '../compare/types.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { FlowReasoningRegistry } from '../flow/FlowReasoningRegistry.js';
import type { FlowReasoningResult, StoredFlowReasoningSnapshot } from '../flow/types.js';
import type { PatchPreflightRegistry } from '../patch-preflight/PatchPreflightRegistry.js';
import type { PatchPreflightResult, StoredPatchPreflightSnapshot } from '../patch-preflight/types.js';
import type { PurePreflightRegistry } from '../pure-preflight/PurePreflightRegistry.js';
import type { PurePreflightContext, StoredPurePreflightSnapshot } from '../pure-preflight/types.js';
import type { RebuildContextRegistry } from '../rebuild-integration/RebuildContextRegistry.js';
import type { RebuildContext, StoredRebuildContextSnapshot } from '../rebuild-integration/types.js';
import type { TaskManifestManager } from '../task/TaskManifestManager.js';
import type { RegressionWorkflowRunner } from '../workflow/RegressionWorkflowRunner.js';
import type {
  DeliveryCompareAnchorSummary,
  DeliveryFlowReasoningSummary,
  DeliveryPatchPreflightSummary,
  DeliveryPurePreflightSummary,
  DeliveryRebuildContextSummary,
  RegressionContext
} from './types.js';

interface RegressionContextResolverDeps {
  compareAnchorRegistry: CompareAnchorRegistry;
  patchPreflightRegistry: PatchPreflightRegistry;
  rebuildContextRegistry: RebuildContextRegistry;
  flowReasoningRegistry: FlowReasoningRegistry;
  purePreflightRegistry: PurePreflightRegistry;
  aiAugmentationRegistry: AiAugmentationRegistry;
  baselineRegistry: BaselineRegistry;
  regressionRunner: RegressionRunner;
  regressionWorkflowRunner: RegressionWorkflowRunner;
  evidenceStore: EvidenceStore;
  taskManifestManager: TaskManifestManager;
}

interface RegressionContextEvidence {
  source: 'runtime-last' | 'task-artifact';
  taskId?: string;
  baseline: RegressionBaseline | null;
  regression: RegressionRunResult | null;
  compareAnchor: CompareAnchorSelectionResult | null;
  patchPreflight: PatchPreflightResult | null;
  rebuildContext: RebuildContext | null;
  purePreflight: PurePreflightContext | null;
  flowReasoning: FlowReasoningResult | null;
  hasAiAugmentation: boolean;
  notes: string[];
}

export class RegressionContextResolver {
  constructor(private readonly deps: RegressionContextResolverDeps) {}

  async resolve(options: {
    taskId?: string;
    source?: 'runtime-last' | 'task-artifact';
  } = {}): Promise<RegressionContext> {
    if (options.source === 'task-artifact' && !options.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'prepare_regression_context with source=task-artifact requires taskId.');
    }

    const evidence = options.source === 'task-artifact'
      ? await this.readTaskEvidence(options.taskId as string)
      : await this.readRuntimeEvidence(options.taskId);
    const compareAnchor = this.summarizeCompareAnchor(evidence.compareAnchor);
    const patchPreflight = this.summarizePatchPreflight(evidence.patchPreflight);
    const rebuildContext = this.summarizeRebuildContext(evidence.rebuildContext);
    const purePreflight = this.summarizePurePreflight(evidence.purePreflight);
    const flowReasoning = this.summarizeFlowReasoning(evidence.flowReasoning);
    const baselineId = evidence.baseline?.baselineId ?? evidence.regression?.baselineId;

    const context: RegressionContext = {
      ...(baselineId ? { baselineId } : {}),
      compareAnchor,
      contextId: makeContextId(compareAnchor?.label ?? patchPreflight?.target ?? flowReasoning?.targetName ?? baselineId ?? 'regression-context'),
      flowReasoning,
      nextActions: this.buildNextActions(evidence, compareAnchor, patchPreflight, rebuildContext, purePreflight, flowReasoning),
      patchPreflight,
      purePreflight,
      rebuildContext,
      regressionNotes: this.buildNotes(evidence, compareAnchor, patchPreflight, rebuildContext, purePreflight, flowReasoning),
      stopIf: this.buildStopIf(evidence, compareAnchor, patchPreflight, rebuildContext, purePreflight)
    };

    return {
      ...context,
      nextActions: uniqueStrings(context.nextActions, 16),
      regressionNotes: uniqueStrings(context.regressionNotes, 40),
      stopIf: uniqueStrings(context.stopIf, 16)
    };
  }

  private async readRuntimeEvidence(taskId: string | undefined): Promise<RegressionContextEvidence> {
    const workflow = this.deps.regressionWorkflowRunner.getLastRegressionWorkflowResult();
    const regression = workflow?.regression ?? this.deps.regressionRunner.getLastRegressionRunResult();
    const baseline = workflow?.baseline ?? (taskId ? await this.deps.baselineRegistry.getLatest(taskId) : null);

    return {
      baseline,
      compareAnchor: this.deps.compareAnchorRegistry.getLast(),
      flowReasoning: this.deps.flowReasoningRegistry.getLast(),
      hasAiAugmentation: Boolean(this.deps.aiAugmentationRegistry.getLast()),
      notes: [
        'Runtime source enabled; latest in-memory reverse, rebuild, pure, and regression artifacts were used.',
        'Regression truth remains the matched baseline and deterministic regression run; AI is not used as gate truth.'
      ],
      patchPreflight: this.deps.patchPreflightRegistry.getLast(),
      purePreflight: this.deps.purePreflightRegistry.getLast(),
      rebuildContext: this.deps.rebuildContextRegistry.getLast(),
      regression,
      source: 'runtime-last'
    };
  }

  private async readTaskEvidence(taskId: string): Promise<RegressionContextEvidence> {
    await this.deps.taskManifestManager.ensureTask(taskId);
    const [baseline, regression, compareAnchor, patchPreflight, rebuildContext, flowReasoning, purePreflight, aiAugmentation] =
      await Promise.all([
        this.deps.baselineRegistry.getLatest(taskId).catch(() => null),
        this.readSnapshot<RegressionRunResult>(taskId, 'run/regression-run'),
        this.readStoredResult<StoredCompareAnchorSnapshot>(taskId, 'compare-anchor/latest'),
        this.readStoredResult<StoredPatchPreflightSnapshot>(taskId, 'patch-preflight/latest'),
        this.readStoredResult<StoredRebuildContextSnapshot>(taskId, 'rebuild-context/latest'),
        this.readStoredResult<StoredFlowReasoningSnapshot>(taskId, 'flow-reasoning/latest'),
        this.readStoredResult<StoredPurePreflightSnapshot>(taskId, 'pure-preflight/latest'),
        this.readSnapshot<unknown>(taskId, 'ai-augmentation/latest')
      ]);

    return {
      baseline,
      compareAnchor,
      flowReasoning,
      hasAiAugmentation: Boolean(aiAugmentation),
      notes: [
        `Task artifact source enabled for ${taskId}; runtime caches were not used.`,
        'Regression context was resolved from persisted deterministic artifacts.'
      ],
      patchPreflight,
      purePreflight,
      rebuildContext,
      regression,
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

  private summarizeFlowReasoning(result: FlowReasoningResult | null): DeliveryFlowReasoningSummary | null {
    return result
      ? {
          resultId: result.resultId,
          targetName: result.targetName
        }
      : null;
  }

  private buildNotes(
    evidence: RegressionContextEvidence,
    compareAnchor: DeliveryCompareAnchorSummary | null,
    patchPreflight: DeliveryPatchPreflightSummary | null,
    rebuildContext: DeliveryRebuildContextSummary | null,
    purePreflight: DeliveryPurePreflightSummary | null,
    flowReasoning: DeliveryFlowReasoningSummary | null
  ): string[] {
    return [
      ...evidence.notes,
      evidence.baseline
        ? `Regression baseline ${evidence.baseline.baselineId} is the deterministic baseline truth source.`
        : 'No latest regression baseline was found; delivery should not proceed until a baseline is registered.',
      evidence.regression
        ? `Latest regression run ${evidence.regression.runId} matchedBaseline=${evidence.regression.matchedBaseline}.`
        : 'No latest regression run was found; run regression before delivery packaging.',
      compareAnchor
        ? `Compare anchor ${compareAnchor.label} keeps divergence review anchored to the first explainable output.`
        : 'No compare anchor was available; regression divergence may be harder to explain.',
      patchPreflight
        ? `Patch preflight focus ${patchPreflight.surface}:${patchPreflight.target} is available for drift triage.`
        : 'No patch preflight focus was available for regression drift triage.',
      rebuildContext
        ? `Rebuild context ${rebuildContext.contextId} contributes rebuild provenance.`
        : 'No rebuild context was available; prepare_rebuild_context should run before trusted delivery handoff.',
      purePreflight
        ? `Pure preflight ${purePreflight.contextId} contributes reverse-to-pure provenance.`
        : 'No pure preflight context was available; plan_pure_preflight should run before pure-driven delivery.',
      flowReasoning
        ? `Flow reasoning ${flowReasoning.resultId} contributes helper/binder explanation for divergence review.`
        : 'No flow reasoning result was available; divergence review will rely on boundary/window evidence only.',
      evidence.hasAiAugmentation
        ? 'AI augmentation is available as readability enhancer, but it is not regression truth.'
        : 'No AI augmentation was available; deterministic regression context remains sufficient for gate truth.'
    ];
  }

  private buildNextActions(
    evidence: RegressionContextEvidence,
    compareAnchor: DeliveryCompareAnchorSummary | null,
    patchPreflight: DeliveryPatchPreflightSummary | null,
    rebuildContext: DeliveryRebuildContextSummary | null,
    purePreflight: DeliveryPurePreflightSummary | null,
    flowReasoning: DeliveryFlowReasoningSummary | null
  ): string[] {
    const actions = [
      evidence.regression?.matchedBaseline
        ? 'Use the matched regression result as deterministic delivery readiness evidence.'
        : 'Run or fix regression until the latest run matches the registered baseline.',
      compareAnchor
        ? `Review any first divergence against compare anchor ${compareAnchor.label} before broad output diffing.`
        : 'Run select_compare_anchor so regression drift has a focused first-divergence reference.',
      patchPreflight
        ? `Keep regression triage aligned to patch preflight ${patchPreflight.surface}:${patchPreflight.target}.`
        : 'Run plan_patch_preflight before deciding whether drift belongs in fixture input, compare anchor, or patch work.',
      rebuildContext
        ? `Carry rebuild context ${rebuildContext.contextId} into delivery context preparation.`
        : 'Run prepare_rebuild_context before delivery handoff if rebuild provenance is missing.',
      purePreflight
        ? `Carry pure preflight ${purePreflight.contextId} into delivery context preparation.`
        : 'Run plan_pure_preflight before treating pure output as delivery-ready provenance.',
      flowReasoning
        ? `Use flow reasoning ${flowReasoning.resultId} to explain helper consumers and request binders in regression notes.`
        : 'Run analyze_flow_reasoning if helper/binder provenance is still implicit.'
    ];

    return actions;
  }

  private buildStopIf(
    evidence: RegressionContextEvidence,
    compareAnchor: DeliveryCompareAnchorSummary | null,
    patchPreflight: DeliveryPatchPreflightSummary | null,
    rebuildContext: DeliveryRebuildContextSummary | null,
    purePreflight: DeliveryPurePreflightSummary | null
  ): string[] {
    return [
      'Stop delivery if the latest regression run does not match the registered baseline.',
      evidence.baseline
        ? `Stop refreshing baseline ${evidence.baseline.baselineId} until acceptance confirms changed behavior.`
        : 'Stop delivery because no regression baseline exists.',
      compareAnchor
        ? `Stop broad request-level drift review until compare anchor ${compareAnchor.label} is checked first.`
        : 'Stop if regression review cannot identify a compare anchor or first explainable divergence.',
      patchPreflight
        ? `Stop patch expansion outside ${patchPreflight.surface}:${patchPreflight.target} unless deterministic divergence proves it.`
        : 'Stop patch work if no patch preflight focus exists.',
      rebuildContext && purePreflight
        ? 'Stop if rebuild/pure provenance conflicts with the regression baseline; resolve deterministic artifacts first.'
        : 'Stop final handoff until rebuild context and pure preflight provenance are present.',
      'Stop if AI explanation conflicts with deterministic regression, compare, rebuild, or pure artifacts.'
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

  private async readStoredResult<T extends { result: unknown }>(taskId: string, name: string): Promise<T['result'] | null> {
    const snapshot = await this.readSnapshot<T>(taskId, name);
    return snapshot?.result ?? null;
  }
}

function makeContextId(seed: string): string {
  const safe = seed.replace(/[^A-Za-z0-9_$.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'regression-context';
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
