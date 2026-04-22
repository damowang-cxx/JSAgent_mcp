import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import type { DeliveryContext } from '../../delivery-consumption/types.js';
import { ToolCategory } from '../categories.js';
import { defineTool, type ToolContext } from '../ToolDefinition.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportDeliveryContextReportParams = z.infer<typeof schema>;

export const exportDeliveryContextReportTool = defineTool<ExportDeliveryContextReportParams>({
  name: 'export_delivery_context_report',
  description: 'Export a delivery context report that separates deterministic delivery provenance from optional AI handoff explanation.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const format = params.format ?? 'json';
    const resolved = await readDeliveryContext(params, context);
    if (!resolved.result) {
      throw new AppError('DELIVERY_CONTEXT_NOT_FOUND', 'No delivery context is available. Run prepare_delivery_context first.');
    }

    const built = await context.runtime.getDeliveryContextReportBuilder().build(resolved.result, format);
    const report = format === 'markdown' ? { markdown: built.markdown } : { json: built.json };

    if (params.writeSnapshot && params.taskId) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      const jsonReport = await context.runtime.getDeliveryContextReportBuilder().build(resolved.result, 'json');
      const markdownReport = await context.runtime.getDeliveryContextReportBuilder().build(resolved.result, 'markdown');
      await evidenceStore.writeSnapshot(params.taskId, 'delivery-context/report-json', { json: jsonReport.json });
      await evidenceStore.writeSnapshot(params.taskId, 'delivery-context/report-markdown', { markdown: markdownReport.markdown });
    }

    return {
      format,
      report,
      source: resolved.source,
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});

async function readDeliveryContext(
  params: ExportDeliveryContextReportParams,
  context: ToolContext
): Promise<{ result: DeliveryContext | null; source: 'runtime-last' | 'task-artifact' }> {
  if (params.source === 'task-artifact' && !params.taskId) {
    throw new AppError('TASK_ID_REQUIRED', 'export_delivery_context_report with source=task-artifact requires taskId.');
  }

  if (params.taskId && params.source !== 'runtime-last') {
    const snapshot = await context.runtime.getDeliveryContextRegistry().readDeliveryFromTask(params.taskId);
    if (snapshot) {
      return {
        result: snapshot.result,
        source: 'task-artifact'
      };
    }
    if (params.source === 'task-artifact') {
      throw new AppError('DELIVERY_CONTEXT_NOT_FOUND', `No delivery-context/latest snapshot found for task ${params.taskId}.`);
    }
  }

  const cached = context.runtime.getDeliveryContextRegistry().getLastDeliveryContext();
  if (cached) {
    return {
      result: cached,
      source: 'runtime-last'
    };
  }

  return {
    result: await context.runtime.getDeliveryContextAssembler().assemble({ source: 'runtime-last' }),
    source: 'runtime-last'
  };
}
