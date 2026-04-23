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

type HookFunctionParams = z.infer<typeof schema>;

export const hookFunctionTool = defineTool<HookFunctionParams>({
  name: 'hook_function',
  description: 'Observe-first, hook-preferred, breakpoint-last function scalpel wrapper for quickly watching one selected-page function before broad workflow escalation.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const item = await context.runtime.getFunctionHookManager().hook({
      ...params,
      mode: 'hook'
    });
    const snapshot = await buildFunctionScalpelSnapshot(context, {
      hooks: context.runtime.getFunctionHookManager().list(),
      notes: ['Function hook installed as a lightweight runtime wrapper on the selected page.']
    });
    const evidenceWritten = await recordFunctionScalpel(context, {
      evidence: {
        action: 'hook',
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
