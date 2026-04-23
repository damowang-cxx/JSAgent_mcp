import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { buildFunctionScalpelSnapshot, recordFunctionScalpel } from './functionScalpelToolHelpers.js';

const schema = z.object({
  hookId: z.string(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type UnhookFunctionParams = z.infer<typeof schema>;

export const unhookFunctionTool = defineTool<UnhookFunctionParams>({
  name: 'unhook_function',
  description: 'Observe-first, hook-preferred, breakpoint-last cleanup for a lightweight function scalpel hook.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const removed = await context.runtime.getFunctionHookManager().remove(params.hookId);
    const remaining = context.runtime.getFunctionHookManager().list();
    const snapshot = await buildFunctionScalpelSnapshot(context, {
      hooks: remaining,
      notes: ['Function hook cleanup attempted on the selected page and runtime registry.']
    });
    const evidenceWritten = await recordFunctionScalpel(context, {
      evidence: {
        action: 'unhook',
        hookId: params.hookId,
        kind: 'function_scalpel_hook',
        removed
      },
      snapshot,
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });

    return {
      evidenceWritten,
      remaining,
      removed
    };
  }
});
