import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import type { PatchPreflightResult } from '../../patch-preflight/types.js';
import { ToolCategory } from '../categories.js';
import { defineTool, type ToolContext } from '../ToolDefinition.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportPatchPreflightReportParams = z.infer<typeof schema>;

export const exportPatchPreflightReportTool = defineTool<ExportPatchPreflightReportParams>({
  name: 'export_patch_preflight_report',
  description: 'Export a patch preflight report that explains the first patch focus; this is not an AST patch planner or automatic patch engine.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const format = params.format ?? 'json';
    const resolved = await readPatchPreflightResult(params, context);
    if (!resolved.result) {
      throw new AppError('PATCH_PREFLIGHT_NOT_FOUND', 'No patch preflight result is available. Run plan_patch_preflight first.');
    }

    const built = await context.runtime.getPatchPreflightReportBuilder().build(resolved.result, format);
    const report = format === 'markdown' ? { markdown: built.markdown } : { json: built.json };

    if (params.writeSnapshot && params.taskId) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      const jsonReport = await context.runtime.getPatchPreflightReportBuilder().build(resolved.result, 'json');
      const markdownReport = await context.runtime.getPatchPreflightReportBuilder().build(resolved.result, 'markdown');
      await evidenceStore.writeSnapshot(params.taskId, 'patch-preflight/report-json', { json: jsonReport.json });
      await evidenceStore.writeSnapshot(params.taskId, 'patch-preflight/report-markdown', { markdown: markdownReport.markdown });
    }

    return {
      format,
      report,
      source: resolved.source,
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});

async function readPatchPreflightResult(
  params: ExportPatchPreflightReportParams,
  context: ToolContext
): Promise<{ result: PatchPreflightResult | null; source: 'runtime-last' | 'task-artifact' }> {
  if (params.source === 'task-artifact' && !params.taskId) {
    throw new AppError('TASK_ID_REQUIRED', 'export_patch_preflight_report with source=task-artifact requires taskId.');
  }

  if (params.taskId && params.source !== 'runtime-last') {
    const snapshot = await context.runtime.getPatchPreflightRegistry().readFromTask(params.taskId);
    if (snapshot) {
      return {
        result: snapshot.result,
        source: 'task-artifact'
      };
    }
    if (params.source === 'task-artifact') {
      throw new AppError('PATCH_PREFLIGHT_NOT_FOUND', `No patch-preflight/latest snapshot found for task ${params.taskId}.`);
    }
  }

  const cached = context.runtime.getPatchPreflightRegistry().getLast();
  if (cached) {
    return {
      result: cached,
      source: 'runtime-last'
    };
  }

  return {
    result: await context.runtime.getPatchPreflightPlanner().plan({ source: 'runtime-last' }),
    source: 'runtime-last'
  };
}
