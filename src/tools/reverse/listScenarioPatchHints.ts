import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  taskId: z.string().optional()
});

type ListScenarioPatchHintsParams = z.infer<typeof schema>;

export const listScenarioPatchHintsTool = defineTool<ListScenarioPatchHintsParams>({
  name: 'list_scenario_patch_hints',
  description: 'List scenario patch hint sets from the current runtime cache or from task artifacts.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    if (params.taskId) {
      return {
        items: await context.runtime.getScenarioPatchHintRegistry().listFromTask(params.taskId)
      };
    }

    const latest = context.runtime.getScenarioPatchHintRegistry().getLastStored();
    return {
      items: latest ? [latest] : []
    };
  }
});
