import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  source: z.enum(['pure-last']).optional(),
  taskId: z.string().optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportPureReportParams = z.infer<typeof schema>;

export const exportPureReportTool = defineTool<ExportPureReportParams>({
  name: 'export_pure_report',
  description: 'Export a PureExtraction report from the latest pure workflow result.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const format = params.format ?? 'json';
    const result = context.runtime.getPureExtractionRunner().getLastPureExtractionResult();
    if (!result) {
      throw new AppError('PURE_RESULT_NOT_FOUND', 'No run_pure_workflow result is cached in this runtime yet.');
    }

    const built = await context.runtime.getPureReportBuilder().build(result, format);
    const report = format === 'markdown' ? { markdown: built.markdown } : { json: built.json };

    if (params.writeSnapshot && params.taskId) {
      await context.runtime.getEvidenceStore().openTask({ taskId: params.taskId });
      await context.runtime.getEvidenceStore().writeSnapshot(params.taskId, `run/pure-report-${format}`, report);
    }

    return {
      format,
      report,
      source: params.source ?? 'pure-last',
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});
