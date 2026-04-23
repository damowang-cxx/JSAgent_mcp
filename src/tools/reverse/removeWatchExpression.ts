import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { buildDebuggerFinishingSnapshot, recordDebuggerFinishing } from './debuggerFinishingToolHelpers.js';

const schema = z.object({
  watchId: z.string(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type RemoveWatchExpressionParams = z.infer<typeof schema>;

export const removeWatchExpressionTool = defineTool<RemoveWatchExpressionParams>({
  name: 'remove_watch_expression',
  description: 'Observe-first, hook-preferred, breakpoint-last removal of a debugger watch expression while keeping evaluation bounded.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const removed = context.runtime.getWatchExpressionRegistry().remove(params.watchId);
    const remaining = context.runtime.getWatchExpressionRegistry().list();
    const snapshot = buildDebuggerFinishingSnapshot(context, {
      watchExpressions: remaining,
      notes: ['Watch expression registry updated.']
    });
    const evidenceWritten = await recordDebuggerFinishing(context, {
      evidence: {
        kind: 'debugger_watch_expression',
        action: 'remove',
        removed,
        watchId: params.watchId
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
