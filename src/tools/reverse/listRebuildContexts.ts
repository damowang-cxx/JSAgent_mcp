import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional()
});

type ListRebuildContextsParams = z.infer<typeof schema>;

export const listRebuildContextsTool = defineTool<ListRebuildContextsParams>({
  name: 'list_rebuild_contexts',
  description: 'List the latest rebuild context from runtime cache or task artifacts; this is the reverse-to-rebuild input layer, not bundle slicing.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    if (params.source === 'task-artifact' && !params.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'list_rebuild_contexts with source=task-artifact requires taskId.');
    }

    if (params.taskId && params.source !== 'runtime-last') {
      const snapshot = await context.runtime.getRebuildContextRegistry().readFromTask(params.taskId);
      if (snapshot) {
        return {
          result: snapshot.result,
          source: 'task-artifact' as const
        };
      }
      if (params.source === 'task-artifact') {
        return {
          result: null,
          source: 'task-artifact' as const
        };
      }
    }

    return {
      result: context.runtime.getRebuildContextRegistry().getLast(),
      source: 'runtime-last' as const
    };
  }
});
