import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import type { ScenarioAnalysisResult, ScenarioWorkflowResult } from '../../scenario/types.js';
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
  description: 'Export a scenario workflow or analysis report from task artifacts or the latest run_scenario_recipe result.',
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
        'No scenario workflow or scenario analysis result is available. Run run_scenario_recipe, run analyze_signature_chain, or provide a taskId with scenario artifacts.'
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
): Promise<ScenarioWorkflowResult | ScenarioAnalysisResult | null> {
  if (taskId) {
    try {
      const snapshot = await context.runtime.getEvidenceStore().readSnapshot(taskId, 'scenario/workflow');
      if (isScenarioWorkflowResult(snapshot)) {
        return snapshot;
      }
    } catch {
      // Fall back to scenario/analysis or runtime cache when workflow is not available.
    }

    try {
      const snapshot = await context.runtime.getEvidenceStore().readSnapshot(taskId, 'scenario/analysis');
      if (isScenarioAnalysisResult(snapshot)) {
        return snapshot;
      }
    } catch {
      // Fall back to runtime cache when the task or snapshot is not available.
    }
  }

  return context.runtime.getScenarioWorkflowRunner().getLastScenarioWorkflowResult();
}

function isScenarioAnalysisResult(value: unknown): value is ScenarioAnalysisResult {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'scenario' in value &&
      'indicators' in value &&
      'priorityTargets' in value &&
      'nextActions' in value
  );
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
