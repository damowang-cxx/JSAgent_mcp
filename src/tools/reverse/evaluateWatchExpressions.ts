import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { buildDebuggerFinishingSnapshot, recordDebuggerFinishing } from './debuggerFinishingToolHelpers.js';

const schema = z.object({
  frameIndex: z.number().int().min(0).optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type EvaluateWatchExpressionsParams = z.infer<typeof schema>;

export const evaluateWatchExpressionsTool = defineTool<EvaluateWatchExpressionsParams>({
  name: 'evaluate_watch_expressions',
  description: 'Observe-first, hook-preferred, breakpoint-last evaluation of bounded watch expressions on paused call frame first, otherwise selected debug target runtime.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const items = await context.runtime.getPausedInspector().evaluateWatchExpressions({
      frameIndex: params.frameIndex
    });
    const snapshot = buildDebuggerFinishingSnapshot(context, {
      lastWatchValues: items,
      watchExpressions: context.runtime.getWatchExpressionRegistry().list(),
      notes: ['Watch expressions were evaluated with bounded previews; failures are returned per expression.']
    });
    const evidenceWritten = await recordDebuggerFinishing(context, {
      evidence: {
        count: items.length,
        failed: items.filter((item) => !item.ok).length,
        frameIndex: params.frameIndex ?? null,
        kind: 'debugger_watch_expression',
        action: 'evaluate'
      },
      snapshot,
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });

    return {
      evidenceWritten,
      items
    };
  }
});
