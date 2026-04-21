import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  source: z.enum(['window-last', 'helper-boundary-last', 'scenario-last', 'task-artifact']).optional(),
  targetName: z.string().optional(),
  targetUrl: z.string().optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type PlanScenarioProbeParams = z.infer<typeof schema>;

export const planScenarioProbeTool = defineTool<PlanScenarioProbeParams>({
  name: 'plan_scenario_probe',
  description: 'Plan the next scenario-guided probe from dependency window, helper boundary, scenario, capture, or task artifacts.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getScenarioProbePlanner().plan({
      source: params.source,
      targetName: params.targetName,
      targetUrl: params.targetUrl,
      taskId: params.taskId
    });

    if (params.taskId && params.writeEvidence) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({
        targetUrl: params.targetUrl,
        taskId: params.taskId
      });
      await evidenceStore.appendLog(params.taskId, 'runtime-evidence', {
        basedOn: result.basedOn,
        kind: 'scenario_probe_plan',
        planId: result.planId,
        priority: result.priority,
        steps: result.steps,
        targetName: result.targetName
      });
      await context.runtime.getProbePlanRegistry().storeToTask(params.taskId, result);
      await context.runtime.getTaskManifestManager().ensureTask(params.taskId, {
        targetUrl: params.targetUrl
      });
      await context.runtime.getTaskManifestManager().updatePointers(params.taskId, {
        scenarioProbe: 'scenario-probe/latest'
      });
    } else {
      context.runtime.getProbePlanRegistry().setLast(result);
    }

    return {
      evidenceWritten: Boolean(params.taskId && params.writeEvidence),
      result
    };
  }
});
