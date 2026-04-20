import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import type { RegressionRunResult } from '../../regression/types.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  source: z.enum(['regression-last']).optional(),
  taskId: z.string().optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportRegressionReportParams = z.infer<typeof schema>;

export const exportRegressionReportTool = defineTool<ExportRegressionReportParams>({
  name: 'export_regression_report',
  description: 'Export a report for the latest regression run.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = context.runtime.getRegressionRunner().getLastRegressionRunResult() ??
      (params.taskId
        ? await context.runtime.getEvidenceStore().readSnapshot(params.taskId, 'run/regression-run')
        : undefined);
    if (!result) {
      throw new AppError('REGRESSION_RESULT_NOT_FOUND', 'No regression run result is cached or available from task artifacts.');
    }

    const format = params.format ?? 'json';
    const report = await context.runtime.getRegressionReportBuilder().build(result as RegressionRunResult, format);
    if (params.writeSnapshot && params.taskId) {
      await context.runtime.getEvidenceStore().writeSnapshot(params.taskId, `delivery/regression-report-${format}`, report);
    }

    return {
      format,
      report,
      source: params.source ?? 'regression-last',
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});
