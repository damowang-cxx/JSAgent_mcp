import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { buildFunctionScalpelSnapshot, recordFunctionScalpel } from './functionScalpelToolHelpers.js';

const schema = z.object({
  targetExpression: z.string(),
  urlFilter: z.string().optional(),
  logArgs: z.boolean().optional(),
  logResult: z.boolean().optional(),
  logStack: z.boolean().optional(),
  pauseOnCall: z.boolean().optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type TraceFunctionParams = z.infer<typeof schema>;

export const traceFunctionTool = defineTool<TraceFunctionParams>({
  name: 'trace_function',
  description: 'Observe-first, hook-preferred, breakpoint-last logpoint-style function scalpel trace for a single selected-page function.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const item = await context.runtime.getFunctionHookManager().hook({
      ...params,
      mode: 'trace'
    });
    const snapshot = await buildFunctionScalpelSnapshot(context, {
      hooks: context.runtime.getFunctionHookManager().list(),
      notes: ['Function trace installed as a lightweight logpoint-style runtime wrapper.']
    });
    const evidenceWritten = await recordFunctionScalpel(context, {
      evidence: {
        action: 'trace',
        hookId: item.hookId,
        kind: 'function_scalpel_hook',
        mode: item.mode,
        targetExpression: item.targetExpression
      },
      snapshot,
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });

    return {
      evidenceWritten,
      item
    };
  }
});
