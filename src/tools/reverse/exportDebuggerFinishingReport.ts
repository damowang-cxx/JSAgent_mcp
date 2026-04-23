import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { buildDebuggerFinishingSnapshot, readDebuggerFinishingSnapshot } from './debuggerFinishingToolHelpers.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportDebuggerFinishingReportParams = z.infer<typeof schema>;

export const exportDebuggerFinishingReportTool = defineTool<ExportDebuggerFinishingReportParams>({
  name: 'export_debugger_finishing_report',
  description: 'Export observe-first, hook-preferred, breakpoint-last debugger finishing report for exception breakpoints, watch expressions, and lite targets.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const format = params.format ?? 'json';
    const resolved = params.source === 'task-artifact' || params.taskId
      ? await readDebuggerFinishingSnapshot(context, params, 'export_debugger_finishing_report')
      : {
        snapshot: context.runtime.getDebuggerFinishingRegistry().getLast() ?? buildDebuggerFinishingSnapshot(context),
        source: 'runtime-last' as const
      };
    const snapshot = resolved.snapshot ?? (resolved.source === 'runtime-last' ? buildDebuggerFinishingSnapshot(context) : null);
    if (!snapshot) {
      throw new AppError('DEBUGGER_FINISHING_SNAPSHOT_NOT_FOUND', 'No debugger finishing snapshot is available.');
    }

    const built = await context.runtime.getDebuggerFinishingReportBuilder().build(snapshot, format);
    const report = format === 'markdown' ? { markdown: built.markdown } : { json: built.json };

    if (params.writeSnapshot && params.taskId) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      await context.runtime.getDebuggerFinishingRegistry().storeToTask(params.taskId, snapshot);
      const jsonReport = await context.runtime.getDebuggerFinishingReportBuilder().build(snapshot, 'json');
      const markdownReport = await context.runtime.getDebuggerFinishingReportBuilder().build(snapshot, 'markdown');
      await evidenceStore.writeSnapshot(params.taskId, 'debugger-finishing/report-json', { json: jsonReport.json });
      await evidenceStore.writeSnapshot(params.taskId, 'debugger-finishing/report-markdown', { markdown: markdownReport.markdown });
    }

    return {
      format,
      report,
      source: resolved.source,
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});
