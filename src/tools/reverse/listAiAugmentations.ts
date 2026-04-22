import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional()
});

type ListAiAugmentationsParams = z.infer<typeof schema>;

export const listAiAugmentationsTool = defineTool<ListAiAugmentationsParams>({
  name: 'list_ai_augmentations',
  description: 'List the latest AI augmentation result from runtime cache or task artifacts; deterministic evidence remains the truth source.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    if (params.source === 'task-artifact' && !params.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'list_ai_augmentations with source=task-artifact requires taskId.');
    }

    if (params.taskId && params.source !== 'runtime-last') {
      const snapshot = await context.runtime.getAiAugmentationRegistry().readFromTask(params.taskId);
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
      result: context.runtime.getAiAugmentationRegistry().getLast(),
      source: 'runtime-last' as const
    };
  }
});
