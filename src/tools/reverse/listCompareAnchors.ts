import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional()
});

type ListCompareAnchorsParams = z.infer<typeof schema>;

export const listCompareAnchorsTool = defineTool<ListCompareAnchorsParams>({
  name: 'list_compare_anchors',
  description: 'List the latest compare anchor selection from task artifacts or runtime cache; anchors should come from focused evidence, not whole-object fallback.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    if (params.source === 'task-artifact' && !params.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'list_compare_anchors with source=task-artifact requires taskId.');
    }

    if (params.taskId && params.source !== 'runtime-last') {
      const snapshot = await context.runtime.getCompareAnchorRegistry().readFromTask(params.taskId);
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
      result: context.runtime.getCompareAnchorRegistry().getLast(),
      source: 'runtime-last' as const
    };
  }
});
