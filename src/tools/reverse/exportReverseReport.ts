import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  source: z.enum(['session', 'analyze-target-last']).optional(),
  taskId: z.string().optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportReverseReportParams = z.infer<typeof schema>;

export const exportReverseReportTool = defineTool<ExportReverseReportParams>({
  name: 'export_reverse_report',
  description: 'Export a reverse-focused report from the current session or the latest analyze_target result.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const format = params.format ?? 'json';
    const source = params.source ?? 'session';
    let report: Record<string, unknown>;

    if (source === 'analyze-target-last') {
      const lastResult = context.runtime.getAnalyzeTargetRunner().getLastAnalyzeTargetResult();
      if (!lastResult) {
        throw new AppError('ANALYZE_TARGET_RESULT_NOT_FOUND', 'No analyze_target result is cached in this runtime yet.');
      }

      const built = await context.runtime.getReverseReportBuilder().buildAnalyzeTargetReport(lastResult, format);
      report = format === 'markdown' ? { markdown: built.markdown } : { json: built.json };
    } else {
      const built = await context.runtime.getSessionReporter().export(format, {
        includeHookData: true,
        includeRecentRequests: true
      });
      report = format === 'markdown' ? { markdown: built.markdown } : { json: built.json };
    }

    if (params.writeSnapshot && params.taskId) {
      await context.runtime.getEvidenceStore().openTask({
        taskId: params.taskId
      });
      await context.runtime.getEvidenceStore().writeSnapshot(params.taskId, `reverse-report-${source}-${format}`, report);
    }

    return {
      format,
      report,
      source,
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});
