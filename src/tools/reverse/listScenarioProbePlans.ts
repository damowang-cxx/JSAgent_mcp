import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  taskId: z.string().optional()
});

type ListScenarioProbePlansParams = z.infer<typeof schema>;

export const listScenarioProbePlansTool = defineTool<ListScenarioProbePlansParams>({
  name: 'list_scenario_probe_plans',
  description: 'List scenario-guided probe plans from the current runtime cache or from task artifacts.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    if (params.taskId) {
      return {
        items: await context.runtime.getProbePlanRegistry().listFromTask(params.taskId)
      };
    }

    const latest = context.runtime.getProbePlanRegistry().getLastStored();
    return {
      items: latest ? [latest] : []
    };
  }
});
