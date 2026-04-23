import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { readDebuggerFinishingSnapshot } from './debuggerFinishingToolHelpers.js';

const schema = z.object({
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional()
});

type GetExceptionBreakpointsParams = z.infer<typeof schema>;

export const getExceptionBreakpointsTool = defineTool<GetExceptionBreakpointsParams>({
  name: 'get_exception_breakpoints',
  description: 'Observe-first, hook-preferred, breakpoint-last read of exception breakpoint mode from runtime or task artifact.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    if (params.source === 'task-artifact' || params.taskId) {
      const resolved = await readDebuggerFinishingSnapshot(context, params, 'get_exception_breakpoints');
      if (resolved.source === 'task-artifact') {
        return {
          mode: resolved.snapshot?.exceptionBreakpointMode ?? 'none',
          source: resolved.source
        };
      }
    }

    return {
      mode: context.runtime.getExceptionBreakpointManager().getMode(),
      source: 'runtime-last' as const
    };
  }
});
