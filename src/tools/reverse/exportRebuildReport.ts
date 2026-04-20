import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  source: z.enum(['rebuild-last']).optional(),
  taskId: z.string().optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportRebuildReportParams = z.infer<typeof schema>;

export const exportRebuildReportTool = defineTool<ExportRebuildReportParams>({
  name: 'export_rebuild_report',
  description: 'Export a rebuild/patch stage report from the latest run_rebuild_workflow result.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const format = params.format ?? 'json';
    const source = params.source ?? 'rebuild-last';
    const lastResult = context.runtime.getRebuildWorkflowRunner().getLastRebuildWorkflowResult();

    if (!lastResult) {
      throw new AppError('REBUILD_WORKFLOW_RESULT_NOT_FOUND', 'No run_rebuild_workflow result is cached in this runtime yet.');
    }

    const built = await context.runtime.getRebuildReportBuilder().build(lastResult, format);
    const report = format === 'markdown' ? { markdown: built.markdown } : { json: built.json };

    if (params.writeSnapshot && params.taskId) {
      await context.runtime.getEvidenceStore().openTask({
        taskId: params.taskId
      });
      await context.runtime.getEvidenceStore().writeSnapshot(params.taskId, `rebuild-report-${format}`, report);
    }

    return {
      format,
      report,
      source,
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});
