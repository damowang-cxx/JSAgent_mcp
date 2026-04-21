import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import type { CompareAnchorSelectionResult } from '../../compare/types.js';
import { ToolCategory } from '../categories.js';
import { defineTool, type ToolContext } from '../ToolDefinition.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportCompareAnchorReportParams = z.infer<typeof schema>;

export const exportCompareAnchorReportTool = defineTool<ExportCompareAnchorReportParams>({
  name: 'export_compare_anchor_report',
  description: 'Export a focused compare anchor report for first-divergence workflows; this is not a full diff report.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const format = params.format ?? 'json';
    const resolved = await readCompareAnchorResult(params, context);
    if (!resolved.result) {
      throw new AppError('COMPARE_ANCHOR_NOT_FOUND', 'No compare anchor selection is available. Run select_compare_anchor first.');
    }

    const built = await context.runtime.getCompareAnchorReportBuilder().build(resolved.result, format);
    const report = format === 'markdown' ? { markdown: built.markdown } : { json: built.json };

    if (params.writeSnapshot && params.taskId) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      const jsonReport = await context.runtime.getCompareAnchorReportBuilder().build(resolved.result, 'json');
      const markdownReport = await context.runtime.getCompareAnchorReportBuilder().build(resolved.result, 'markdown');
      await evidenceStore.writeSnapshot(params.taskId, 'compare-anchor/report-json', { json: jsonReport.json });
      await evidenceStore.writeSnapshot(params.taskId, 'compare-anchor/report-markdown', { markdown: markdownReport.markdown });
    }

    return {
      format,
      report,
      source: resolved.source,
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});

async function readCompareAnchorResult(
  params: ExportCompareAnchorReportParams,
  context: ToolContext
): Promise<{ result: CompareAnchorSelectionResult | null; source: 'runtime-last' | 'task-artifact' }> {
  if (params.source === 'task-artifact' && !params.taskId) {
    throw new AppError('TASK_ID_REQUIRED', 'export_compare_anchor_report with source=task-artifact requires taskId.');
  }

  if (params.taskId && params.source !== 'runtime-last') {
    const snapshot = await context.runtime.getCompareAnchorRegistry().readFromTask(params.taskId);
    if (snapshot) {
      return {
        result: snapshot.result,
        source: 'task-artifact'
      };
    }
    if (params.source === 'task-artifact') {
      throw new AppError('COMPARE_ANCHOR_NOT_FOUND', `No compare-anchor/latest snapshot found for task ${params.taskId}.`);
    }
  }

  const cached = context.runtime.getCompareAnchorRegistry().getLast();
  if (cached) {
    return {
      result: cached,
      source: 'runtime-last'
    };
  }

  return {
    result: await context.runtime.getCompareAnchorSelector().select({ source: 'runtime-last' }),
    source: 'runtime-last'
  };
}
