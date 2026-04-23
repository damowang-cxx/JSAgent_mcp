import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { readFunctionScalpelSnapshot } from './functionScalpelToolHelpers.js';

const schema = z.object({
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional()
});

type ListFunctionHooksParams = z.infer<typeof schema>;

export const listFunctionHooksTool = defineTool<ListFunctionHooksParams>({
  name: 'list_function_hooks',
  description: 'Observe-first, hook-preferred, breakpoint-last list of lightweight function scalpel hooks from runtime or task artifact.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    if (params.source === 'task-artifact' || params.taskId) {
      const resolved = await readFunctionScalpelSnapshot(context, params, 'list_function_hooks');
      if (resolved.source === 'task-artifact') {
        return {
          items: resolved.snapshot?.hooks ?? [],
          source: resolved.source
        };
      }
    }

    return {
      items: context.runtime.getFunctionHookManager().list(),
      source: 'runtime-last' as const
    };
  }
});
