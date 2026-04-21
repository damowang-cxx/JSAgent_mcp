import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { DeliveryReportBuilder } from '../report/DeliveryReportBuilder.js';
import type { DeliveryAssembler } from '../sdk/DeliveryAssembler.js';
import type { DeliverySmokeTester } from '../sdk/DeliverySmokeTester.js';
import type { DeliveryBundleExport, DeliverySmokeTestResult } from '../sdk/types.js';
import type { StageGateEvaluator } from '../task/StageGateEvaluator.js';
import type { StageGateResult } from '../task/types.js';

export interface DeliveryHardeningResult {
  bundle: DeliveryBundleExport;
  smoke: DeliverySmokeTestResult;
  deliveryGate: StageGateResult;
  readyForDistribution: boolean;
  nextActions: string[];
  whyTheseSteps: string[];
  stopIf: string[];
}

export class DeliveryHardeningRunner {
  private lastResult: DeliveryHardeningResult | null = null;

  constructor(
    private readonly deps: {
      deliveryAssembler: DeliveryAssembler;
      deliveryReportBuilder: DeliveryReportBuilder;
      deliverySmokeTester: DeliverySmokeTester;
      evidenceStore: EvidenceStore;
      stageGateEvaluator: StageGateEvaluator;
    }
  ) {}

  async run(options: {
    taskId?: string;
    target?: 'node' | 'python' | 'dual';
    overwrite?: boolean;
    timeoutMs?: number;
    writeEvidence?: boolean;
  }): Promise<DeliveryHardeningResult> {
    const bundle = await this.deps.deliveryAssembler.assemble({
      overwrite: options.overwrite,
      target: options.target,
      taskId: options.taskId
    });
    const smoke = await this.deps.deliverySmokeTester.test({
      bundleDir: bundle.outputDir,
      target: bundle.target,
      timeoutMs: options.timeoutMs
    });
    const deliveryGate = options.taskId
      ? await this.deps.stageGateEvaluator.evaluate(options.taskId, 'delivery')
      : {
          checkedAt: new Date().toISOString(),
          missingArtifacts: ['taskId'],
          nextActions: ['Use a taskId for artifact-backed delivery gate evaluation.'],
          passed: false,
          reasons: ['No taskId supplied.'],
          stage: 'delivery' as const
        };
    const readyForDistribution = deliveryGate.passed && smoke.ok;
    const result: DeliveryHardeningResult = {
      bundle,
      deliveryGate,
      nextActions: readyForDistribution
        ? ['Keep this bundle and smoke result as the current distribution candidate.']
        : [smoke.nextActionHint, 'Do not distribute until smoke and delivery gate both pass.'],
      readyForDistribution,
      smoke,
      stopIf: [
        'Stop if delivery gate is not passed.',
        ...(smoke.ok ? [] : ['Stop distribution until smoke test is fixed.'])
      ],
      whyTheseSteps: [
        'Delivery hardening assembles a stronger bundle from verified artifacts first.',
        'Smoke test then validates the bundled implementation rather than the workspace source.'
      ]
    };

    if (options.writeEvidence && options.taskId) {
      await this.deps.evidenceStore.writeSnapshot(options.taskId, 'delivery/smoke', smoke);
      await this.deps.evidenceStore.writeSnapshot(options.taskId, 'delivery/hardening-workflow', result);
      const report = await this.deps.deliveryReportBuilder.build(result, 'markdown');
      await this.deps.evidenceStore.writeSnapshot(options.taskId, 'delivery/report-markdown', report);
    }

    this.lastResult = result;
    return result;
  }

  getLastDeliveryHardeningResult(): DeliveryHardeningResult | null {
    return this.lastResult;
  }
}
