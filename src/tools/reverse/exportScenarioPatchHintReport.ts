import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import type { StoredScenarioPatchHintSet } from '../../patch/types.scenario.js';
import { ToolCategory } from '../categories.js';
import { defineTool, type ToolContext } from '../ToolDefinition.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  source: z.enum(['patch-hints-last', 'task-artifact']).optional(),
  taskId: z.string().optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportScenarioPatchHintReportParams = z.infer<typeof schema>;

export const exportScenarioPatchHintReportTool = defineTool<ExportScenarioPatchHintReportParams>({
  name: 'export_scenario_patch_hint_report',
  description: 'Export a scenario patch hint report from task artifacts or the latest patch hint set.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const format = params.format ?? 'json';
    const resolved = await readPatchHints(params, context);
    if (!resolved) {
      throw new AppError(
        'SCENARIO_PATCH_HINTS_NOT_FOUND',
        'No scenario patch hints are available. Run generate_scenario_patch_hints or provide taskId with scenario-patch-hints/latest.'
      );
    }

    const built = await context.runtime.getScenarioPatchHintReportBuilder().build(resolved.result, format);
    const report = format === 'markdown' ? { markdown: built.markdown } : { json: built.json };

    if (params.writeSnapshot && params.taskId) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      await evidenceStore.writeSnapshot(params.taskId, `scenario-patch-hints/report-${format}`, report);
    }

    return {
      format,
      report,
      source: resolved.source,
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});

async function readPatchHints(
  params: ExportScenarioPatchHintReportParams,
  context: ToolContext
): Promise<{ result: StoredScenarioPatchHintSet['result']; source: 'patch-hints-last' | 'task-artifact' } | null> {
  if (params.source === 'task-artifact' && !params.taskId) {
    throw new AppError('TASK_ID_REQUIRED', 'export_scenario_patch_hint_report with source=task-artifact requires taskId.');
  }

  if (params.taskId && params.source !== 'patch-hints-last') {
    try {
      const snapshot = await context.runtime.getEvidenceStore().readSnapshot(params.taskId, 'scenario-patch-hints/latest');
      if (isStoredScenarioPatchHintSet(snapshot)) {
        return { result: snapshot.result, source: 'task-artifact' };
      }
    } catch {
      // Fall through to runtime cache.
    }
  }

  const latest = context.runtime.getScenarioPatchHintRegistry().getLast();
  return latest ? { result: latest, source: 'patch-hints-last' } : null;
}

function isStoredScenarioPatchHintSet(value: unknown): value is StoredScenarioPatchHintSet {
  return Boolean(value && typeof value === 'object' && 'setId' in value && 'result' in value);
}
