import { AppError } from '../core/errors.js';
import type { BattlefieldSnapshotRegistryLike } from '../battlefield/lineage.js';
import { buildBattlefieldLineageContribution } from '../battlefield/lineage.js';
import type { RegressionContext } from '../delivery-consumption/types.js';
import type { BaselineRegistry } from '../regression/BaselineRegistry.js';
import type { RegressionRunner } from '../regression/RegressionRunner.js';
import type { RegressionBaseline, RegressionRunResult } from '../regression/types.js';
import type { StageGateEvaluator } from '../task/StageGateEvaluator.js';
import type { StageGateResult } from '../task/types.js';

export interface RegressionWorkflowResult {
  baseline: RegressionBaseline;
  regression: RegressionRunResult;
  gate: StageGateResult;
  nextActions: string[];
  whyTheseSteps: string[];
  stopIf: string[];
  regressionContextUsed?: RegressionContext | null;
  compareAnchorUsed?: RegressionContext['compareAnchor'];
  patchPreflightUsed?: RegressionContext['patchPreflight'];
  rebuildContextUsed?: RegressionContext['rebuildContext'];
  purePreflightUsed?: RegressionContext['purePreflight'];
  flowReasoningUsed?: RegressionContext['flowReasoning'];
}

export class RegressionWorkflowRunner {
  private lastResult: RegressionWorkflowResult | null = null;

  constructor(
    private readonly deps: {
      baselineRegistry: BaselineRegistry;
      regressionRunner: RegressionRunner;
      stageGateEvaluator: StageGateEvaluator;
      battlefieldIntegrationRegistry?: BattlefieldSnapshotRegistryLike;
    }
  ) {}

  async run(options: {
    taskId?: string;
    source?: 'pure' | 'port' | 'regression-context-last' | 'task-artifact';
    baselineSource?: 'pure' | 'port';
    regressionContext?: RegressionContext | null;
    registerIfMissing?: boolean;
    timeoutMs?: number;
    writeEvidence?: boolean;
  }): Promise<RegressionWorkflowResult> {
    const baselineSource = options.baselineSource ?? (options.source === 'pure' || options.source === 'port' ? options.source : 'port');
    let baseline = await this.deps.baselineRegistry.getLatest(options.taskId);
    if (!baseline && options.registerIfMissing !== false) {
      baseline = await this.deps.baselineRegistry.register({
        source: baselineSource,
        taskId: options.taskId
      });
    }
    if (!baseline) {
      throw new AppError('REGRESSION_BASELINE_NOT_FOUND', 'No regression baseline is available. Register one before running regression workflow.');
    }

    const regression = await this.deps.regressionRunner.run({
      baselineId: baseline.baselineId,
      regressionContext: options.regressionContext ?? null,
      taskId: options.taskId,
      timeoutMs: options.timeoutMs,
      writeEvidence: options.writeEvidence
    });
    const gate = options.taskId
      ? await this.deps.stageGateEvaluator.evaluate(options.taskId, 'delivery')
      : {
          checkedAt: new Date().toISOString(),
          missingArtifacts: ['taskId'],
          nextActions: ['Use a taskId for artifact-backed delivery gate evaluation.'],
          passed: false,
          reasons: ['No taskId supplied.'],
          stage: 'delivery' as const
        };
    const result: RegressionWorkflowResult = {
      baseline,
      gate,
      nextActions: regression.matchedBaseline
        ? [
            'Export the SDK package after confirming the delivery gate.',
            ...this.battlefieldNextActions(),
            ...this.contextNextActions(options.regressionContext)
          ]
        : [regression.nextActionHint, ...this.battlefieldNextActions(), ...this.contextNextActions(options.regressionContext)],
      regression,
      stopIf: [
        'Stop if the regression baseline was registered before pure/port gate passed.',
        ...(regression.matchedBaseline ? [] : ['Stop delivery packaging until regression is matched.']),
        ...this.battlefieldStopIf(),
        ...this.contextStopIf(options.regressionContext)
      ],
      whyTheseSteps: [
        'Regression baseline is fixture-bound and registered only after stage gates pass.',
        'Regression reruns Node/Python pure before SDK packaging.',
        ...this.battlefieldWhy(),
        ...this.contextWhy(options.regressionContext)
      ],
      regressionContextUsed: options.regressionContext ?? null,
      compareAnchorUsed: options.regressionContext?.compareAnchor ?? null,
      patchPreflightUsed: options.regressionContext?.patchPreflight ?? null,
      rebuildContextUsed: options.regressionContext?.rebuildContext ?? null,
      purePreflightUsed: options.regressionContext?.purePreflight ?? null,
      flowReasoningUsed: options.regressionContext?.flowReasoning ?? null
    };
    this.lastResult = result;
    return result;
  }

  async runWithContext(options: {
    taskId?: string;
    source?: 'regression-context-last' | 'task-artifact';
    baselineSource?: 'pure' | 'port';
    regressionContext?: RegressionContext | null;
    registerIfMissing?: boolean;
    timeoutMs?: number;
    writeEvidence?: boolean;
  }): Promise<RegressionWorkflowResult> {
    return await this.run(options);
  }

  getLastRegressionWorkflowResult(): RegressionWorkflowResult | null {
    return this.lastResult;
  }

  private contextNextActions(context: RegressionContext | null | undefined): string[] {
    return context
      ? [
          `Carry regression context ${context.contextId} into delivery context preparation.`,
          ...context.nextActions.slice(0, 3)
        ]
      : [];
  }

  private contextStopIf(context: RegressionContext | null | undefined): string[] {
    return context
      ? [
          `Stop if regression context ${context.contextId} conflicts with the matched baseline.`,
          ...context.stopIf.slice(0, 3)
        ]
      : [];
  }

  private contextWhy(context: RegressionContext | null | undefined): string[] {
    return context
      ? [
          `Regression context ${context.contextId} preserves compare, patch, rebuild, pure, and flow provenance for first-divergence review.`,
          ...context.regressionNotes.slice(0, 3)
        ]
      : [];
  }

  private battlefieldNextActions(): string[] {
    return buildBattlefieldLineageContribution(this.deps.battlefieldIntegrationRegistry?.getLast() ?? null, 'regression workflow').nextActions.slice(0, 1);
  }

  private battlefieldStopIf(): string[] {
    return buildBattlefieldLineageContribution(this.deps.battlefieldIntegrationRegistry?.getLast() ?? null, 'regression workflow').stopIf.slice(0, 1);
  }

  private battlefieldWhy(): string[] {
    return buildBattlefieldLineageContribution(this.deps.battlefieldIntegrationRegistry?.getLast() ?? null, 'regression workflow').whyTheseSteps.slice(0, 1);
  }
}
