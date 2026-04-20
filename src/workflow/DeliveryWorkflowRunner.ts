import { AppError } from '../core/errors.js';
import type { BaselineRegistry } from '../regression/BaselineRegistry.js';
import type { RegressionRunner } from '../regression/RegressionRunner.js';
import type { RegressionBaseline, RegressionRunResult } from '../regression/types.js';
import type { SDKPackager } from '../sdk/SDKPackager.js';
import type { SDKPackageExport } from '../sdk/types.js';
import type { StageGateEvaluator } from '../task/StageGateEvaluator.js';
import type { ReverseStage, StageGateResult } from '../task/types.js';

export interface DeliveryWorkflowResult {
  task?: {
    taskId: string;
    taskDir: string;
  } | null;
  gates: Record<string, StageGateResult>;
  baseline: RegressionBaseline | null;
  regression: RegressionRunResult | null;
  sdk: SDKPackageExport | null;
  readyForDelivery: boolean;
  nextActions: string[];
  whyTheseSteps: string[];
  stopIf: string[];
}

export class DeliveryWorkflowRunner {
  private lastResult: DeliveryWorkflowResult | null = null;

  constructor(
    private readonly deps: {
      baselineRegistry: BaselineRegistry;
      evidenceRoot: { getTaskDir(taskId: string): string };
      regressionRunner: RegressionRunner;
      sdkPackager: SDKPackager;
      stageGateEvaluator: StageGateEvaluator;
    }
  ) {}

  async run(options: {
    taskId?: string;
    target?: 'node' | 'python' | 'dual';
    timeoutMs?: number;
    writeEvidence?: boolean;
  }): Promise<DeliveryWorkflowResult> {
    if (!options.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'run_delivery_workflow requires taskId for artifact-backed delivery.');
    }

    const gates = await this.deps.stageGateEvaluator.evaluateAll(options.taskId);
    let baseline = await this.deps.baselineRegistry.getLatest(options.taskId);
    if (!baseline) {
      baseline = await this.deps.baselineRegistry.register({
        source: (options.target ?? 'dual') === 'node' ? 'pure' : 'port',
        taskId: options.taskId
      });
    }

    const regression = await this.deps.regressionRunner.run({
      baselineId: baseline.baselineId,
      taskId: options.taskId,
      timeoutMs: options.timeoutMs,
      writeEvidence: options.writeEvidence
    });
    const sdk = regression.matchedBaseline
      ? await this.deps.sdkPackager.export({
          overwrite: true,
          target: options.target,
          taskId: options.taskId
        })
      : null;
    const deliveryGate = await this.deps.stageGateEvaluator.evaluate(options.taskId, 'delivery');
    const nextGates: Record<ReverseStage, StageGateResult> = {
      ...gates as Record<ReverseStage, StageGateResult>,
      delivery: deliveryGate
    };
    const readyForDelivery = Boolean(deliveryGate.passed && regression.matchedBaseline && sdk);
    const result: DeliveryWorkflowResult = {
      baseline,
      gates: nextGates,
      nextActions: readyForDelivery
        ? ['Keep the SDK package and regression baseline as delivery artifacts.']
        : [regression.nextActionHint, 'Re-run delivery workflow after resolving the blocking gate.'],
      readyForDelivery,
      regression,
      sdk,
      stopIf: [
        'Stop if pure/port gate is not satisfied for the requested SDK target.',
        ...(regression.matchedBaseline ? [] : ['Stop SDK export until regression matches baseline.'])
      ],
      task: {
        taskDir: this.deps.evidenceRoot.getTaskDir(options.taskId),
        taskId: options.taskId
      },
      whyTheseSteps: [
        'Delivery requires stage gates, a regression baseline, a passing regression run, and SDK package artifacts.',
        'The SDK package is generated only after regression matches the registered baseline.'
      ]
    };
    this.lastResult = result;
    return result;
  }

  getLastDeliveryWorkflowResult(): DeliveryWorkflowResult | null {
    return this.lastResult;
  }
}
