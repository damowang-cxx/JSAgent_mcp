import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import type { RegressionContext } from '../../delivery-consumption/types.js';
import { ToolCategory } from '../categories.js';
import { defineTool, type ToolContext } from '../ToolDefinition.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportRegressionContextReportParams = z.infer<typeof schema>;

export const exportRegressionContextReportTool = defineTool<ExportRegressionContextReportParams>({
  name: 'export_regression_context_report',
  description: 'Export a regression context report with deterministic reverse provenance and first-divergence guidance; AI is optional explanation only.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const format = params.format ?? 'json';
    const resolved = await readRegressionContext(params, context);
    if (!resolved.result) {
      throw new AppError('REGRESSION_CONTEXT_NOT_FOUND', 'No regression context is available. Run prepare_regression_context first.');
    }

    const built = await context.runtime.getRegressionContextReportBuilder().build(resolved.result, format);
    const report = format === 'markdown' ? { markdown: built.markdown } : { json: built.json };

    if (params.writeSnapshot && params.taskId) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      const jsonReport = await context.runtime.getRegressionContextReportBuilder().build(resolved.result, 'json');
      const markdownReport = await context.runtime.getRegressionContextReportBuilder().build(resolved.result, 'markdown');
      await evidenceStore.writeSnapshot(params.taskId, 'regression-context/report-json', { json: jsonReport.json });
      await evidenceStore.writeSnapshot(params.taskId, 'regression-context/report-markdown', { markdown: markdownReport.markdown });
    }

    return {
      format,
      report,
      source: resolved.source,
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});

async function readRegressionContext(
  params: ExportRegressionContextReportParams,
  context: ToolContext
): Promise<{ result: RegressionContext | null; source: 'runtime-last' | 'task-artifact' }> {
  if (params.source === 'task-artifact' && !params.taskId) {
    throw new AppError('TASK_ID_REQUIRED', 'export_regression_context_report with source=task-artifact requires taskId.');
  }

  if (params.taskId && params.source !== 'runtime-last') {
    const snapshot = await context.runtime.getDeliveryContextRegistry().readRegressionFromTask(params.taskId);
    if (snapshot) {
      return {
        result: snapshot.result,
        source: 'task-artifact'
      };
    }
    if (params.source === 'task-artifact') {
      throw new AppError('REGRESSION_CONTEXT_NOT_FOUND', `No regression-context/latest snapshot found for task ${params.taskId}.`);
    }
  }

  const cached = context.runtime.getDeliveryContextRegistry().getLastRegressionContext();
  if (cached) {
    return {
      result: cached,
      source: 'runtime-last'
    };
  }

  return {
    result: await context.runtime.getRegressionContextResolver().resolve({ source: 'runtime-last' }),
    source: 'runtime-last'
  };
}
