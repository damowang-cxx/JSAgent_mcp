import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  taskId: z.string().optional()
});

type ListHelperBoundariesParams = z.infer<typeof schema>;

export const listHelperBoundariesTool = defineTool<ListHelperBoundariesParams>({
  name: 'list_helper_boundaries',
  description: 'List helper boundary results from task artifacts or the current runtime last boundary cache.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    if (params.taskId) {
      return {
        items: await context.runtime.getHelperBoundaryRegistry().listFromTask(params.taskId)
      };
    }

    const last = context.runtime.getHelperBoundaryRegistry().getLastStored();
    return {
      items: last ? [last] : []
    };
  }
});
