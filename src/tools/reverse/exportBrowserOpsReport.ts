import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { readBrowserOpsSnapshot } from './browserOpsToolHelpers.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportBrowserOpsReportParams = z.infer<typeof schema>;

export const exportBrowserOpsReportTool = defineTool<ExportBrowserOpsReportParams>({
  name: 'export_browser_ops_report',
  description: 'Export browser field operations report; separates field observations from hook-preferred reverse workflows and breakpoint-last debugging.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const format = params.format ?? 'json';
    const resolved = await readBrowserOpsSnapshot(context, params);
    if (!resolved.snapshot) {
      throw new AppError('BROWSER_OPS_SNAPSHOT_NOT_FOUND', 'No browser-ops snapshot is available. Run a browser field operation first.');
    }

    const built = await context.runtime.getBrowserOpsReportBuilder().build(resolved.snapshot, format);
    const report = format === 'markdown' ? { markdown: built.markdown } : { json: built.json };

    if (params.writeSnapshot && params.taskId) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      const jsonReport = await context.runtime.getBrowserOpsReportBuilder().build(resolved.snapshot, 'json');
      const markdownReport = await context.runtime.getBrowserOpsReportBuilder().build(resolved.snapshot, 'markdown');
      await evidenceStore.writeSnapshot(params.taskId, 'browser-ops/report-json', { json: jsonReport.json });
      await evidenceStore.writeSnapshot(params.taskId, 'browser-ops/report-markdown', { markdown: markdownReport.markdown });
    }

    return {
      format,
      report,
      source: resolved.source,
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});
