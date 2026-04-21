import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import type { ReplayRecipeResult } from '../../replay/types.js';
import { ToolCategory } from '../categories.js';
import { defineTool, type ToolContext } from '../ToolDefinition.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  source: z.enum(['capture-last', 'task-artifact']).optional(),
  taskId: z.string().optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportCaptureReportParams = z.infer<typeof schema>;

export const exportCaptureReportTool = defineTool<ExportCaptureReportParams>({
  name: 'export_capture_report',
  description: 'Export a replay/capture report from task artifacts or the latest run_capture_recipe result.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const format = params.format ?? 'json';
    const resolved = await readCaptureResult(params, context);
    if (!resolved) {
      throw new AppError(
        'CAPTURE_RESULT_NOT_FOUND',
        'No capture result is available. Run run_capture_recipe or provide taskId with scenario/capture/result.'
      );
    }

    const built = await context.runtime.getCaptureReportBuilder().build(resolved.result, format);
    const report = format === 'markdown' ? { markdown: built.markdown } : { json: built.json };

    if (params.writeSnapshot && params.taskId) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      await evidenceStore.writeSnapshot(params.taskId, `scenario/capture/report-${format}`, report);
    }

    return {
      format,
      report,
      source: resolved.source,
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});

async function readCaptureResult(
  params: ExportCaptureReportParams,
  context: ToolContext
): Promise<{ result: ReplayRecipeResult; source: 'capture-last' | 'task-artifact' } | null> {
  if (params.taskId && params.source !== 'capture-last') {
    try {
      const snapshot = await context.runtime.getEvidenceStore().readSnapshot(params.taskId, 'scenario/capture/result');
      if (isReplayRecipeResult(snapshot)) {
        return { result: snapshot, source: 'task-artifact' };
      }
    } catch {
      // Fall through to runtime cache.
    }
  }

  const latest = context.runtime.getReplayRecipeRunner().getLastReplayRecipeResult();
  return latest ? { result: latest, source: 'capture-last' } : null;
}

function isReplayRecipeResult(value: unknown): value is ReplayRecipeResult {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'executedSteps' in value &&
      'observedRequests' in value &&
      'hookSummary' in value
  );
}
