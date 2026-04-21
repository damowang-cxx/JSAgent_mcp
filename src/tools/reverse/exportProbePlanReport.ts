import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import type { StoredProbePlan } from '../../probe/types.js';
import { ToolCategory } from '../categories.js';
import { defineTool, type ToolContext } from '../ToolDefinition.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  source: z.enum(['probe-last', 'task-artifact']).optional(),
  taskId: z.string().optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportProbePlanReportParams = z.infer<typeof schema>;

export const exportProbePlanReportTool = defineTool<ExportProbePlanReportParams>({
  name: 'export_probe_plan_report',
  description: 'Export a scenario probe plan report from task artifacts or the latest probe plan.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const format = params.format ?? 'json';
    const resolved = await readProbePlan(params, context);
    if (!resolved) {
      throw new AppError(
        'PROBE_PLAN_NOT_FOUND',
        'No scenario probe plan is available. Run plan_scenario_probe or provide taskId with scenario-probe/latest.'
      );
    }

    const built = await context.runtime.getProbePlanReportBuilder().build(resolved.result, format);
    const report = format === 'markdown' ? { markdown: built.markdown } : { json: built.json };

    if (params.writeSnapshot && params.taskId) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      await evidenceStore.writeSnapshot(params.taskId, `scenario-probe/report-${format}`, report);
    }

    return {
      format,
      report,
      source: resolved.source,
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});

async function readProbePlan(
  params: ExportProbePlanReportParams,
  context: ToolContext
): Promise<{ result: StoredProbePlan['result']; source: 'probe-last' | 'task-artifact' } | null> {
  if (params.source === 'task-artifact' && !params.taskId) {
    throw new AppError('TASK_ID_REQUIRED', 'export_probe_plan_report with source=task-artifact requires taskId.');
  }

  if (params.taskId && params.source !== 'probe-last') {
    try {
      const snapshot = await context.runtime.getEvidenceStore().readSnapshot(params.taskId, 'scenario-probe/latest');
      if (isStoredProbePlan(snapshot)) {
        return { result: snapshot.result, source: 'task-artifact' };
      }
    } catch {
      // Fall through to runtime cache.
    }
  }

  const latest = context.runtime.getProbePlanRegistry().getLast();
  return latest ? { result: latest, source: 'probe-last' } : null;
}

function isStoredProbePlan(value: unknown): value is StoredProbePlan {
  return Boolean(value && typeof value === 'object' && 'planId' in value && 'result' in value);
}
