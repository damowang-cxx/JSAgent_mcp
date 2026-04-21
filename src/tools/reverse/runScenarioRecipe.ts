import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  presetId: z.string(),
  targetUrl: z.string().optional(),
  taskId: z.string().optional(),
  topN: z.number().int().positive().optional(),
  writeEvidence: z.boolean().optional()
});

type RunScenarioRecipeParams = z.infer<typeof schema>;

export const runScenarioRecipeTool = defineTool<RunScenarioRecipeParams>({
  name: 'run_scenario_recipe',
  description: 'Run a scenario preset recipe and return analysis, priority targets, next actions, and stop conditions.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => ({
    result: await context.runtime.getScenarioWorkflowRunner().run({
      presetId: params.presetId,
      targetUrl: params.targetUrl,
      taskId: params.taskId,
      topN: params.topN,
      writeEvidence: params.writeEvidence
    })
  })
});
