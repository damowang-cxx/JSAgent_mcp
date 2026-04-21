import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  taskId: z.string().optional()
});

type ListBoundaryFixturesParams = z.infer<typeof schema>;

export const listBoundaryFixturesTool = defineTool<ListBoundaryFixturesParams>({
  name: 'list_boundary_fixtures',
  description: 'List boundary fixture candidates from the current runtime cache or from task artifacts.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    if (params.taskId) {
      return {
        items: await context.runtime.getFixtureCandidateRegistry().listFromTask(params.taskId)
      };
    }

    const latest = context.runtime.getFixtureCandidateRegistry().getLastStored();
    return {
      items: latest ? [latest] : []
    };
  }
});
