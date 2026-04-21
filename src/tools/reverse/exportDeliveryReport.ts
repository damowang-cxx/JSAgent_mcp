import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import type { DeliveryHardeningResult } from '../../workflow/DeliveryHardeningRunner.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  taskId: z.string().optional(),
  format: z.enum(['json', 'markdown']).optional(),
  source: z.enum(['delivery-last']).optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportDeliveryReportParams = z.infer<typeof schema>;

export const exportDeliveryReportTool = defineTool<ExportDeliveryReportParams>({
  name: 'export_delivery_report',
  description: 'Export a delivery hardening report from the latest result or task artifacts.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const cached = context.runtime.getDeliveryHardeningRunner().getLastDeliveryHardeningResult();
    let result: DeliveryHardeningResult | null = cached;

    if (!result && params.taskId) {
      const [bundle, smoke] = await Promise.all([
        context.runtime.getEvidenceStore().readSnapshot(params.taskId, 'delivery/bundle'),
        context.runtime.getEvidenceStore().readSnapshot(params.taskId, 'delivery/smoke')
      ]);
      if (bundle && smoke) {
        const gate = await context.runtime.getStageGateEvaluator().evaluate(params.taskId, 'delivery');
        result = {
          bundle: bundle as DeliveryHardeningResult['bundle'],
          deliveryGate: gate,
          nextActions: gate.passed && (smoke as DeliveryHardeningResult['smoke']).ok
            ? ['Keep this bundle as the current distribution candidate.']
            : [(smoke as DeliveryHardeningResult['smoke']).nextActionHint],
          readyForDistribution: gate.passed && (smoke as DeliveryHardeningResult['smoke']).ok,
          smoke: smoke as DeliveryHardeningResult['smoke'],
          stopIf: ['Stop if delivery gate or smoke test is not passing.'],
          whyTheseSteps: [
            'Delivery report is reconstructed from artifact-backed bundle and smoke test snapshots.'
          ]
        };
      }
    }

    if (!result) {
      throw new AppError('DELIVERY_RESULT_NOT_FOUND', 'No delivery hardening result is cached or available from task artifacts.');
    }

    const format = params.format ?? 'json';
    const report = await context.runtime.getDeliveryReportBuilder().build(result, format);
    if (params.writeSnapshot && params.taskId) {
      await context.runtime.getEvidenceStore().writeSnapshot(params.taskId, `delivery/report-${format}`, report);
    }

    return {
      format,
      report,
      source: params.source ?? 'delivery-last',
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});
