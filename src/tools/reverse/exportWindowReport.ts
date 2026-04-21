import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import type { StoredDependencyWindow } from '../../window/types.js';
import { ToolCategory } from '../categories.js';
import { defineTool, type ToolContext } from '../ToolDefinition.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  source: z.enum(['window-last', 'task-artifact']).optional(),
  taskId: z.string().optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportWindowReportParams = z.infer<typeof schema>;

export const exportWindowReportTool = defineTool<ExportWindowReportParams>({
  name: 'export_window_report',
  description: 'Export a dependency window report from task artifacts or the latest dependency window.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const format = params.format ?? 'json';
    const resolved = await readWindow(params, context);
    if (!resolved) {
      throw new AppError(
        'DEPENDENCY_WINDOW_NOT_FOUND',
        'No dependency window is available. Run extract_dependency_window or provide taskId with dependency-window/latest.'
      );
    }

    const built = await context.runtime.getWindowReportBuilder().build(resolved.result, format);
    const report = format === 'markdown' ? { markdown: built.markdown } : { json: built.json };

    if (params.writeSnapshot && params.taskId) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      await evidenceStore.writeSnapshot(params.taskId, `dependency-window/report-${format}`, report);
    }

    return {
      format,
      report,
      source: resolved.source,
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});

async function readWindow(
  params: ExportWindowReportParams,
  context: ToolContext
): Promise<{ result: StoredDependencyWindow['result']; source: 'window-last' | 'task-artifact' } | null> {
  if (params.source === 'task-artifact' && !params.taskId) {
    throw new AppError('TASK_ID_REQUIRED', 'export_window_report with source=task-artifact requires taskId.');
  }

  if (params.taskId && params.source !== 'window-last') {
    try {
      const snapshot = await context.runtime.getEvidenceStore().readSnapshot(params.taskId, 'dependency-window/latest');
      if (isStoredDependencyWindow(snapshot)) {
        return { result: snapshot.result, source: 'task-artifact' };
      }
    } catch {
      // Fall through to runtime cache.
    }
  }

  const latest = context.runtime.getDependencyWindowRegistry().getLast();
  return latest ? { result: latest, source: 'window-last' } : null;
}

function isStoredDependencyWindow(value: unknown): value is StoredDependencyWindow {
  return Boolean(value && typeof value === 'object' && 'windowId' in value && 'result' in value);
}
