import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import type { SourcePrecisionSnapshot } from '../../source-intel/types.js';
import { ToolCategory } from '../categories.js';
import { defineTool, type ToolContext } from '../ToolDefinition.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportSourcePrecisionReportParams = z.infer<typeof schema>;

export const exportSourcePrecisionReportTool = defineTool<ExportSourcePrecisionReportParams>({
  name: 'export_source_precision_report',
  description: 'Export source precision report from live-script precision snapshots; observe-first, hook-preferred, breakpoint-last, and distinct from collected-code reports.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const format = params.format ?? 'json';
    const resolved = await readSourcePrecisionSnapshot(params, context);
    if (!resolved.snapshot) {
      throw new AppError('SOURCE_PRECISION_SNAPSHOT_NOT_FOUND', 'No source precision snapshot is available. Run list_scripts, find_in_script, or search_in_sources first.');
    }

    const built = await context.runtime.getSourcePrecisionReportBuilder().build(resolved.snapshot, format);
    const report = format === 'markdown' ? { markdown: built.markdown } : { json: built.json };

    if (params.writeSnapshot && params.taskId) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      await context.runtime.getSourcePrecisionRegistry().storeToTask(params.taskId, resolved.snapshot);
      const jsonReport = await context.runtime.getSourcePrecisionReportBuilder().build(resolved.snapshot, 'json');
      const markdownReport = await context.runtime.getSourcePrecisionReportBuilder().build(resolved.snapshot, 'markdown');
      await evidenceStore.writeSnapshot(params.taskId, 'source-precision/report-json', { json: jsonReport.json });
      await evidenceStore.writeSnapshot(params.taskId, 'source-precision/report-markdown', { markdown: markdownReport.markdown });
    }

    return {
      format,
      report,
      source: resolved.source,
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});

async function readSourcePrecisionSnapshot(
  params: ExportSourcePrecisionReportParams,
  context: ToolContext
): Promise<{ snapshot: SourcePrecisionSnapshot | null; source: 'runtime-last' | 'task-artifact' }> {
  if (params.source === 'task-artifact' && !params.taskId) {
    throw new AppError('TASK_ID_REQUIRED', 'export_source_precision_report with source=task-artifact requires taskId.');
  }

  if (params.taskId && params.source !== 'runtime-last') {
    const snapshot = await context.runtime.getSourcePrecisionRegistry().readFromTask(params.taskId);
    if (snapshot) {
      return {
        snapshot,
        source: 'task-artifact'
      };
    }
    if (params.source === 'task-artifact') {
      throw new AppError('SOURCE_PRECISION_SNAPSHOT_NOT_FOUND', `No source-precision/latest snapshot found for task ${params.taskId}.`);
    }
  }

  return {
    snapshot: context.runtime.getSourcePrecisionRegistry().getLast(),
    source: 'runtime-last'
  };
}
