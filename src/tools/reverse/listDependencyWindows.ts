import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  taskId: z.string().optional()
});

type ListDependencyWindowsParams = z.infer<typeof schema>;

export const listDependencyWindowsTool = defineTool<ListDependencyWindowsParams>({
  name: 'list_dependency_windows',
  description: 'List dependency windows from the current runtime cache or from task artifacts.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    if (params.taskId) {
      return {
        items: await context.runtime.getDependencyWindowRegistry().listFromTask(params.taskId)
      };
    }

    const latest = context.runtime.getDependencyWindowRegistry().getLastStored();
    return {
      items: latest ? [latest] : []
    };
  }
});
