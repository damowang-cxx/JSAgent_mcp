import { AppError } from '../core/errors.js';
import type { DeliveryContext } from '../delivery-consumption/types.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
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
  deliveryContextUsed?: DeliveryContext | null;
  compareAnchorUsed?: DeliveryContext['compareAnchor'];
  patchPreflightUsed?: DeliveryContext['patchPreflight'];
  rebuildContextUsed?: DeliveryContext['rebuildContext'];
  purePreflightUsed?: DeliveryContext['purePreflight'];
  aiAugmentationUsed?: DeliveryContext['aiAugmentation'];
}

export class DeliveryWorkflowRunner {
  private lastResult: DeliveryWorkflowResult | null = null;

  constructor(
    private readonly deps: {
      baselineRegistry: BaselineRegistry;
      evidenceStore: EvidenceStore;
      regressionRunner: RegressionRunner;
      sdkPackager: SDKPackager;
      stageGateEvaluator: StageGateEvaluator;
    }
  ) {}

  async run(options: {
    taskId?: string;
    source?: 'delivery-context-last' | 'task-artifact';
    deliveryContext?: DeliveryContext | null;
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
      regressionContext: options.deliveryContext?.regressionContext ?? null,
      taskId: options.taskId,
      timeoutMs: options.timeoutMs,
      writeEvidence: true
    });
    const sdk = regression.matchedBaseline
      ? await this.deps.sdkPackager.export({
          deliveryContext: options.deliveryContext ?? null,
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
        ? [
            'Keep the SDK package and regression baseline as delivery artifacts.',
            ...this.contextNextActions(options.deliveryContext)
          ]
        : [
            regression.nextActionHint,
            'Re-run delivery workflow after resolving the blocking gate.',
            ...this.contextNextActions(options.deliveryContext)
          ],
      readyForDelivery,
      regression,
      sdk,
      stopIf: [
        'Stop if pure/port gate is not satisfied for the requested SDK target.',
        ...(regression.matchedBaseline ? [] : ['Stop SDK export until regression matches baseline.']),
        ...this.contextStopIf(options.deliveryContext)
      ],
      task: {
        taskDir: this.deps.evidenceStore.getTaskDir(options.taskId),
        taskId: options.taskId
      },
      whyTheseSteps: [
        'Delivery requires stage gates, a regression baseline, a passing regression run, and SDK package artifacts.',
        'The SDK package is generated only after regression matches the registered baseline.',
        ...this.contextWhy(options.deliveryContext)
      ],
      deliveryContextUsed: options.deliveryContext ?? null,
      compareAnchorUsed: options.deliveryContext?.compareAnchor ?? null,
      patchPreflightUsed: options.deliveryContext?.patchPreflight ?? null,
      rebuildContextUsed: options.deliveryContext?.rebuildContext ?? null,
      purePreflightUsed: options.deliveryContext?.purePreflight ?? null,
      aiAugmentationUsed: options.deliveryContext?.aiAugmentation ?? null
    };

    if (options.writeEvidence) {
      await this.writeEvidence(options.taskId, result);
    }

    this.lastResult = result;
    return result;
  }

  getLastDeliveryWorkflowResult(): DeliveryWorkflowResult | null {
    return this.lastResult;
  }

  async runWithContext(options: {
    taskId?: string;
    source?: 'delivery-context-last' | 'task-artifact';
    deliveryContext?: DeliveryContext | null;
    target?: 'node' | 'python' | 'dual';
    timeoutMs?: number;
    writeEvidence?: boolean;
  }): Promise<DeliveryWorkflowResult> {
    return await this.run(options);
  }

  private async writeEvidence(taskId: string, result: DeliveryWorkflowResult): Promise<void> {
    await this.deps.evidenceStore.appendLog(taskId, 'runtime-evidence', {
      deliveryContextId: result.deliveryContextUsed?.contextId ?? null,
      kind: 'delivery_workflow',
      readyForDelivery: result.readyForDelivery,
      regressionMatched: result.regression?.matchedBaseline ?? false,
      sdkTarget: result.sdk?.target ?? null
    });
    await this.deps.evidenceStore.writeSnapshot(taskId, 'delivery/gates', result.gates);
    await this.deps.evidenceStore.writeSnapshot(taskId, 'delivery/workflow-result', result);
    await this.deps.evidenceStore.writeSnapshot(taskId, 'delivery/delivery-report-markdown', {
      markdown: this.buildMarkdown(result)
    });
  }

  private buildMarkdown(result: DeliveryWorkflowResult): string {
    return `${[
      '# JSAgent_mcp Delivery Workflow Report',
      '',
      '## Task',
      '',
      `- Task: ${result.task?.taskId ?? '(none)'}`,
      '',
      '## Gates',
      '',
      ...Object.values(result.gates).map((gate) => `- ${gate.stage}: ${gate.passed ? 'passed' : 'blocked'}`),
      '',
      '## Baseline',
      '',
      `- ${result.baseline?.baselineId ?? '(none)'}`,
      '',
      '## Regression',
      '',
      `- Matched: ${result.regression?.matchedBaseline ?? false}`,
      `- Hint: ${result.regression?.nextActionHint ?? '(none)'}`,
      '',
      '## SDK',
      '',
      `- Exported: ${Boolean(result.sdk)}`,
      `- Target: ${result.sdk?.target ?? '(none)'}`,
      '',
      '## Delivery Context',
      '',
      `- Context: ${result.deliveryContextUsed?.contextId ?? '(none)'}`,
      `- Compare Anchor: ${result.compareAnchorUsed?.label ?? '(none)'}`,
      `- Patch Preflight: ${result.patchPreflightUsed ? `${result.patchPreflightUsed.surface}:${result.patchPreflightUsed.target}` : '(none)'}`,
      `- Rebuild Context: ${result.rebuildContextUsed?.contextId ?? '(none)'}`,
      `- Pure Preflight: ${result.purePreflightUsed?.contextId ?? '(none)'}`,
      `- AI Augmentation: ${result.aiAugmentationUsed?.augmentationId ?? '(none)'}`,
      '',
      '## Ready For Delivery',
      '',
      `- ${result.readyForDelivery}`,
      '',
      '## Next Actions',
      '',
      ...result.nextActions.map((item) => `- ${item}`),
      '',
      '## Why These Steps',
      '',
      ...result.whyTheseSteps.map((item) => `- ${item}`),
      '',
      '## Stop If',
      '',
      ...result.stopIf.map((item) => `- ${item}`)
    ].join('\n')}\n`;
  }

  private contextNextActions(context: DeliveryContext | null | undefined): string[] {
    return context
      ? [
          `Preserve delivery context ${context.contextId} in the handoff bundle/report.`,
          ...context.nextActions.slice(0, 3)
        ]
      : [];
  }

  private contextStopIf(context: DeliveryContext | null | undefined): string[] {
    return context
      ? [
          `Stop if delivery context ${context.contextId} conflicts with deterministic gates or regression results.`,
          ...context.stopIf.slice(0, 3)
        ]
      : [];
  }

  private contextWhy(context: DeliveryContext | null | undefined): string[] {
    return context
      ? [
          `Delivery context ${context.contextId} carries reverse, rebuild, pure, regression, and optional AI explanation provenance into delivery.`,
          ...context.provenanceSummary.slice(0, 3)
        ]
      : [];
  }
}
