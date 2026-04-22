import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import type { RebuildContext } from '../../rebuild-integration/types.js';
import { ToolCategory } from '../categories.js';
import { defineTool, type ToolContext } from '../ToolDefinition.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportRebuildContextReportParams = z.infer<typeof schema>;

export const exportRebuildContextReportTool = defineTool<ExportRebuildContextReportParams>({
  name: 'export_rebuild_context_report',
  description: 'Export a rebuild context report explaining which boundary fixture, compare anchor, and patch preflight are driving rebuild.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const format = params.format ?? 'json';
    const resolved = await readRebuildContext(params, context);
    if (!resolved.result) {
      throw new AppError('REBUILD_CONTEXT_NOT_FOUND', 'No rebuild context is available. Run prepare_rebuild_context first.');
    }

    const built = await context.runtime.getRebuildContextReportBuilder().build(resolved.result, format);
    const report = format === 'markdown' ? { markdown: built.markdown } : { json: built.json };

    if (params.writeSnapshot && params.taskId) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      const jsonReport = await context.runtime.getRebuildContextReportBuilder().build(resolved.result, 'json');
      const markdownReport = await context.runtime.getRebuildContextReportBuilder().build(resolved.result, 'markdown');
      await evidenceStore.writeSnapshot(params.taskId, 'rebuild-context/report-json', { json: jsonReport.json });
      await evidenceStore.writeSnapshot(params.taskId, 'rebuild-context/report-markdown', { markdown: markdownReport.markdown });
    }

    return {
      format,
      report,
      source: resolved.source,
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});

async function readRebuildContext(
  params: ExportRebuildContextReportParams,
  context: ToolContext
): Promise<{ result: RebuildContext | null; source: 'runtime-last' | 'task-artifact' }> {
  if (params.source === 'task-artifact' && !params.taskId) {
    throw new AppError('TASK_ID_REQUIRED', 'export_rebuild_context_report with source=task-artifact requires taskId.');
  }

  if (params.taskId && params.source !== 'runtime-last') {
    const snapshot = await context.runtime.getRebuildContextRegistry().readFromTask(params.taskId);
    if (snapshot) {
      return {
        result: snapshot.result,
        source: 'task-artifact'
      };
    }
    if (params.source === 'task-artifact') {
      throw new AppError('REBUILD_CONTEXT_NOT_FOUND', `No rebuild-context/latest snapshot found for task ${params.taskId}.`);
    }
  }

  const cached = context.runtime.getRebuildContextRegistry().getLast();
  if (cached) {
    return {
      result: cached,
      source: 'runtime-last'
    };
  }

  return {
    result: await context.runtime.getRebuildInputResolver().resolve({ source: 'runtime-last' }),
    source: 'runtime-last'
  };
}
