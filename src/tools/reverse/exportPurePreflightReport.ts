import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import type { PurePreflightContext } from '../../pure-preflight/types.js';
import { ToolCategory } from '../categories.js';
import { defineTool, type ToolContext } from '../ToolDefinition.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportPurePreflightReportParams = z.infer<typeof schema>;

export const exportPurePreflightReportTool = defineTool<ExportPurePreflightReportParams>({
  name: 'export_pure_preflight_report',
  description: 'Export a pure preflight report explaining reverse artifacts that feed pure extraction; hook evidence stays primary and debugger is enhancer-only.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const format = params.format ?? 'json';
    const resolved = await readPurePreflight(params, context);
    if (!resolved.result) {
      throw new AppError('PURE_PREFLIGHT_NOT_FOUND', 'No pure preflight context is available. Run plan_pure_preflight first.');
    }

    const built = await context.runtime.getPurePreflightReportBuilder().build(resolved.result, format);
    const report = format === 'markdown' ? { markdown: built.markdown } : { json: built.json };

    if (params.writeSnapshot && params.taskId) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      const jsonReport = await context.runtime.getPurePreflightReportBuilder().build(resolved.result, 'json');
      const markdownReport = await context.runtime.getPurePreflightReportBuilder().build(resolved.result, 'markdown');
      await evidenceStore.writeSnapshot(params.taskId, 'pure-preflight/report-json', { json: jsonReport.json });
      await evidenceStore.writeSnapshot(params.taskId, 'pure-preflight/report-markdown', { markdown: markdownReport.markdown });
    }

    return {
      format,
      report,
      source: resolved.source,
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});

async function readPurePreflight(
  params: ExportPurePreflightReportParams,
  context: ToolContext
): Promise<{ result: PurePreflightContext | null; source: 'runtime-last' | 'task-artifact' }> {
  if (params.source === 'task-artifact' && !params.taskId) {
    throw new AppError('TASK_ID_REQUIRED', 'export_pure_preflight_report with source=task-artifact requires taskId.');
  }

  if (params.taskId && params.source !== 'runtime-last') {
    const snapshot = await context.runtime.getPurePreflightRegistry().readFromTask(params.taskId);
    if (snapshot) {
      return {
        result: snapshot.result,
        source: 'task-artifact'
      };
    }
    if (params.source === 'task-artifact') {
      throw new AppError('PURE_PREFLIGHT_NOT_FOUND', `No pure-preflight/latest snapshot found for task ${params.taskId}.`);
    }
  }

  const cached = context.runtime.getPurePreflightRegistry().getLast();
  if (cached) {
    return {
      result: cached,
      source: 'runtime-last'
    };
  }

  return {
    result: await context.runtime.getPurePreflightPlanner().plan({ source: 'runtime-last' }),
    source: 'runtime-last'
  };
}
