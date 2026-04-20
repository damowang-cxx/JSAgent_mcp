import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  source: z.enum(['port-last']).optional(),
  taskId: z.string().optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportPortReportParams = z.infer<typeof schema>;

export const exportPortReportTool = defineTool<ExportPortReportParams>({
  name: 'export_port_report',
  description: 'Export a Port phase report from the latest port workflow result.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const format = params.format ?? 'json';
    const result = await context.runtime.getPortWorkflowRunner().getPortWorkflowResult(params.taskId);
    if (!result) {
      throw new AppError('PORT_RESULT_NOT_FOUND', 'No run_port_workflow result is cached or available from task artifacts.');
    }

    const built = await context.runtime.getPortReportBuilder().build(result, format);
    const report = format === 'markdown' ? { markdown: built.markdown } : { json: built.json };

    if (params.writeSnapshot && params.taskId) {
      await context.runtime.getEvidenceStore().openTask({ taskId: params.taskId });
      await context.runtime.getEvidenceStore().writeSnapshot(params.taskId, `run/port-report-${format}`, report);
    }

    return {
      format,
      report,
      source: params.source ?? 'port-last',
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});
