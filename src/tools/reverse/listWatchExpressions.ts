import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { readDebuggerFinishingSnapshot } from './debuggerFinishingToolHelpers.js';

const schema = z.object({
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional()
});

type ListWatchExpressionsParams = z.infer<typeof schema>;

export const listWatchExpressionsTool = defineTool<ListWatchExpressionsParams>({
  name: 'list_watch_expressions',
  description: 'Observe-first, hook-preferred, breakpoint-last list of debugger finishing watch expressions from runtime or task artifact.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    if (params.source === 'task-artifact' || params.taskId) {
      const resolved = await readDebuggerFinishingSnapshot(context, params, 'list_watch_expressions');
      if (resolved.source === 'task-artifact') {
        return {
          items: resolved.snapshot?.watchExpressions ?? [],
          source: resolved.source
        };
      }
    }

    return {
      items: context.runtime.getWatchExpressionRegistry().list(),
      source: 'runtime-last' as const
    };
  }
});
