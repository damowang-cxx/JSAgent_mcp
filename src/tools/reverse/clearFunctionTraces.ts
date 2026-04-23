import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { buildFunctionScalpelSnapshot, recordFunctionScalpel } from './functionScalpelToolHelpers.js';

const schema = z.object({
  hookId: z.string().optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type ClearFunctionTracesParams = z.infer<typeof schema>;

export const clearFunctionTracesTool = defineTool<ClearFunctionTracesParams>({
  name: 'clear_function_traces',
  description: 'Observe-first, hook-preferred, breakpoint-last clear of bounded function scalpel trace records.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    context.runtime.getFunctionTraceRegistry().clear({
      hookId: params.hookId
    });
    await context.runtime.getFunctionHookManager().clearPageTraceRecords({
      hookId: params.hookId
    });
    const snapshot = await buildFunctionScalpelSnapshot(context, {
      traces: context.runtime.getFunctionTraceRegistry().list({ limit: 200 }),
      notes: ['Function trace records cleared from runtime and selected-page scalpel store.']
    });
    const evidenceWritten = await recordFunctionScalpel(context, {
      evidence: {
        action: 'clear_traces',
        hookId: params.hookId ?? null,
        kind: 'function_scalpel_hook'
      },
      snapshot,
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });

    return {
      cleared: true,
      evidenceWritten
    };
  }
});
