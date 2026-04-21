import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional()
});

type ListPatchPreflightsParams = z.infer<typeof schema>;

export const listPatchPreflightsTool = defineTool<ListPatchPreflightsParams>({
  name: 'list_patch_preflights',
  description: 'List the latest patch preflight from runtime cache or task artifacts; preflight is a patch-before-planning layer, not an apply engine.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    if (params.source === 'task-artifact' && !params.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'list_patch_preflights with source=task-artifact requires taskId.');
    }

    if (params.taskId && params.source !== 'runtime-last') {
      const snapshot = await context.runtime.getPatchPreflightRegistry().readFromTask(params.taskId);
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
      result: context.runtime.getPatchPreflightRegistry().getLast(),
      source: 'runtime-last' as const
    };
  }
});
