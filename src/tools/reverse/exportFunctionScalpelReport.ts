import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { buildFunctionScalpelSnapshot, readFunctionScalpelSnapshot } from './functionScalpelToolHelpers.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportFunctionScalpelReportParams = z.infer<typeof schema>;

export const exportFunctionScalpelReportTool = defineTool<ExportFunctionScalpelReportParams>({
  name: 'export_function_scalpel_report',
  description: 'Export observe-first, hook-preferred, breakpoint-last function scalpel report for hooks, traces, inspections, and event monitors.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const format = params.format ?? 'json';
    const resolved = params.source === 'task-artifact' || params.taskId
      ? await readFunctionScalpelSnapshot(context, params, 'export_function_scalpel_report')
      : {
        snapshot: context.runtime.getFunctionScalpelRegistry().getLast() ?? await buildFunctionScalpelSnapshot(context),
        source: 'runtime-last' as const
      };
    const snapshot = resolved.snapshot ?? (resolved.source === 'runtime-last' ? await buildFunctionScalpelSnapshot(context) : null);
    if (!snapshot) {
      throw new AppError('FUNCTION_SCALPEL_SNAPSHOT_NOT_FOUND', 'No function scalpel snapshot is available.');
    }

    const built = await context.runtime.getFunctionScalpelReportBuilder().build(snapshot, format);
    const report = format === 'markdown' ? { markdown: built.markdown } : { json: built.json };

    if (params.writeSnapshot && params.taskId) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      await context.runtime.getFunctionScalpelRegistry().storeToTask(params.taskId, snapshot);
      const jsonReport = await context.runtime.getFunctionScalpelReportBuilder().build(snapshot, 'json');
      const markdownReport = await context.runtime.getFunctionScalpelReportBuilder().build(snapshot, 'markdown');
      await evidenceStore.writeSnapshot(params.taskId, 'function-scalpel/report-json', { json: jsonReport.json });
      await evidenceStore.writeSnapshot(params.taskId, 'function-scalpel/report-markdown', { markdown: markdownReport.markdown });
    }

    return {
      format,
      report,
      source: resolved.source,
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});
