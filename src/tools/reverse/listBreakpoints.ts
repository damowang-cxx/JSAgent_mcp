import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  taskId: z.string().optional()
});

type ListBreakpointsParams = z.infer<typeof schema>;

export const listBreakpointsTool = defineTool<ListBreakpointsParams>({
  name: 'list_breakpoints',
  description: 'List debugger breakpoints. Debugger breakpoints are breakpoint-last artifacts; prefer hooks/watchpoints for routine capture.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    if (params.source === 'task-artifact' && !params.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'list_breakpoints with source=task-artifact requires taskId.');
    }

    if (params.taskId && params.source !== 'runtime-last') {
      const snapshot = await context.runtime.getBreakpointRegistry().readFromTask(params.taskId);
      if (snapshot) {
        return {
          items: snapshot.items,
          source: 'task-artifact' as const
        };
      }
      if (params.source === 'task-artifact') {
        return {
          items: [],
          source: 'task-artifact' as const
        };
      }
    }

    try {
      await context.runtime.getDebuggerSessionManager().ensureAttached();
      context.runtime.getBreakpointRegistry().setItems(context.runtime.getDebuggerSessionManager().listBreakpoints());
    } catch {
      // Keep runtime registry fallback if no page is currently selected.
    }

    return {
      items: context.runtime.getBreakpointRegistry().getItems(),
      source: 'runtime-last' as const
    };
  }
});
