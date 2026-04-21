import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import type { ScenarioWorkflowResult } from '../../scenario/types.js';
import { ToolCategory } from '../categories.js';
import { defineTool, type ToolContext } from '../ToolDefinition.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  source: z.enum(['scenario-last']).optional(),
  taskId: z.string().optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportScenarioReportParams = z.infer<typeof schema>;

export const exportScenarioReportTool = defineTool<ExportScenarioReportParams>({
  name: 'export_scenario_report',
  description: 'Export a scenario workflow report from task artifacts or the latest run_scenario_recipe result.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const format = params.format ?? 'json';
    const source = params.source ?? 'scenario-last';
    const result = await readScenarioResult(params.taskId, context);

    if (!result) {
      throw new AppError(
        'SCENARIO_RESULT_NOT_FOUND',
        'No scenario workflow result is available. Run run_scenario_recipe first or provide a taskId with scenario/workflow artifact.'
      );
    }

    const built = await context.runtime.getScenarioReportBuilder().build(result, format);
    const report = format === 'markdown' ? { markdown: built.markdown } : { json: built.json };

    if (params.writeSnapshot && params.taskId) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      await evidenceStore.writeSnapshot(params.taskId, `scenario/report-${format}`, report);
    }

    return {
      format,
      report,
      source,
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});

async function readScenarioResult(
  taskId: string | undefined,
  context: ToolContext
): Promise<ScenarioWorkflowResult | null> {
  if (taskId) {
    try {
      const snapshot = await context.runtime.getEvidenceStore().readSnapshot(taskId, 'scenario/workflow');
      if (isScenarioWorkflowResult(snapshot)) {
        return snapshot;
      }
    } catch {
      // Fall back to runtime cache when the task or snapshot is not available.
    }
  }

  return context.runtime.getScenarioWorkflowRunner().getLastScenarioWorkflowResult();
}

function isScenarioWorkflowResult(value: unknown): value is ScenarioWorkflowResult {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'preset' in value &&
      'analysis' in value &&
      'nextActions' in value
  );
}
