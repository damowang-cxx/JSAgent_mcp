import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  taskId: z.string(),
  writeSnapshot: z.boolean().optional()
});

type ExportTaskStateReportParams = z.infer<typeof schema>;

export const exportTaskStateReportTool = defineTool<ExportTaskStateReportParams>({
  name: 'export_task_state_report',
  description: 'Export an artifact-first task state and stage gate report.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const format = params.format ?? 'json';
    const report = await context.runtime.getTaskStateReportBuilder().build(params.taskId, format);
    if (params.writeSnapshot) {
      await context.runtime.getEvidenceStore().writeSnapshot(params.taskId, `delivery/task-state-report-${format}`, report);
    }
    return {
      format,
      report,
      writtenSnapshot: Boolean(params.writeSnapshot)
    };
  }
});
