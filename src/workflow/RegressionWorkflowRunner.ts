import { AppError } from '../core/errors.js';
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
}

export class RegressionWorkflowRunner {
  private lastResult: RegressionWorkflowResult | null = null;

  constructor(
    private readonly deps: {
      baselineRegistry: BaselineRegistry;
      regressionRunner: RegressionRunner;
      stageGateEvaluator: StageGateEvaluator;
    }
  ) {}

  async run(options: {
    taskId?: string;
    source?: 'pure' | 'port';
    registerIfMissing?: boolean;
    timeoutMs?: number;
    writeEvidence?: boolean;
  }): Promise<RegressionWorkflowResult> {
    let baseline = await this.deps.baselineRegistry.getLatest(options.taskId);
    if (!baseline && options.registerIfMissing !== false) {
      baseline = await this.deps.baselineRegistry.register({
        source: options.source ?? 'port',
        taskId: options.taskId
      });
    }
    if (!baseline) {
      throw new AppError('REGRESSION_BASELINE_NOT_FOUND', 'No regression baseline is available. Register one before running regression workflow.');
    }

    const regression = await this.deps.regressionRunner.run({
      baselineId: baseline.baselineId,
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
        ? ['Export the SDK package after confirming the delivery gate.']
        : [regression.nextActionHint],
      regression,
      stopIf: [
        'Stop if the regression baseline was registered before pure/port gate passed.',
        ...(regression.matchedBaseline ? [] : ['Stop delivery packaging until regression is matched.'])
      ],
      whyTheseSteps: [
        'Regression baseline is fixture-bound and registered only after stage gates pass.',
        'Regression reruns Node/Python pure before SDK packaging.'
      ]
    };
    this.lastResult = result;
    return result;
  }

  getLastRegressionWorkflowResult(): RegressionWorkflowResult | null {
    return this.lastResult;
  }
}
