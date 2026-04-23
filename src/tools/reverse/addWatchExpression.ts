import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { buildDebuggerFinishingSnapshot, recordDebuggerFinishing } from './debuggerFinishingToolHelpers.js';

const schema = z.object({
  expression: z.string(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type AddWatchExpressionParams = z.infer<typeof schema>;

export const addWatchExpressionTool = defineTool<AddWatchExpressionParams>({
  name: 'add_watch_expression',
  description: 'Observe-first, hook-preferred, breakpoint-last add of a bounded watch expression for debugger fallback verification after source precision narrows the target.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const item = context.runtime.getWatchExpressionRegistry().add(params.expression);
    const snapshot = buildDebuggerFinishingSnapshot(context, {
      watchExpressions: context.runtime.getWatchExpressionRegistry().list(),
      notes: ['Watch expression added to the runtime registry; values are evaluated only on demand.']
    });
    const evidenceWritten = await recordDebuggerFinishing(context, {
      evidence: {
        expression: item.expression,
        kind: 'debugger_watch_expression',
        action: 'add',
        watchId: item.watchId
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
