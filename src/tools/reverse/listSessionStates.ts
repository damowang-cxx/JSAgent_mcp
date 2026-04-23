import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { readBrowserOpsSnapshot } from './browserOpsToolHelpers.js';

const schema = z.object({
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional()
});

type ListSessionStatesParams = z.infer<typeof schema>;

export const listSessionStatesTool = defineTool<ListSessionStatesParams>({
  name: 'list_session_states',
  description: 'List browser field session states from runtime cache or task artifacts; bounded state only, not full VM/profile restore.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    if (params.source === 'task-artifact' && !params.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'list_session_states with source=task-artifact requires taskId.');
    }

    if (params.source === 'task-artifact' || params.taskId) {
      const resolved = await readBrowserOpsSnapshot(context, params);
      if (resolved.source === 'task-artifact') {
        return {
          items: resolved.snapshot?.activeSessionStates ?? [],
          source: 'task-artifact' as const
        };
      }
    }

    return {
      items: context.runtime.getSessionStateManager().list(),
      source: 'runtime-last' as const
    };
  }
});
