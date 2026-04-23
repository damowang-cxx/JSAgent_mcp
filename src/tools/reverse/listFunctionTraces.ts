import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { readFunctionScalpelSnapshot } from './functionScalpelToolHelpers.js';

const schema = z.object({
  hookId: z.string().optional(),
  limit: z.number().int().min(1).optional(),
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional()
});

type ListFunctionTracesParams = z.infer<typeof schema>;

export const listFunctionTracesTool = defineTool<ListFunctionTracesParams>({
  name: 'list_function_traces',
  description: 'Observe-first, hook-preferred, breakpoint-last list of bounded function scalpel trace records.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    if (params.source === 'task-artifact' || params.taskId) {
      const resolved = await readFunctionScalpelSnapshot(context, params, 'list_function_traces');
      if (resolved.source === 'task-artifact') {
        const limit = Math.max(1, Math.min(500, Math.floor(params.limit ?? 100)));
        return {
          items: (resolved.snapshot?.traces ?? []).filter((item) => !params.hookId || item.hookId === params.hookId).slice(-limit),
          source: resolved.source
        };
      }
    }

    const traces = await context.runtime.getFunctionHookManager().collectTraceRecords();
    context.runtime.getFunctionTraceRegistry().appendMany(traces);
    return {
      items: context.runtime.getFunctionTraceRegistry().list({
        hookId: params.hookId,
        limit: params.limit
      }),
      source: 'runtime-last' as const
    };
  }
});
