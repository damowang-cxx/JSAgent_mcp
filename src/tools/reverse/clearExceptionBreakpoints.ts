import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { buildDebuggerFinishingSnapshot, recordDebuggerFinishing } from './debuggerFinishingToolHelpers.js';

const schema = z.object({
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type ClearExceptionBreakpointsParams = z.infer<typeof schema>;

export const clearExceptionBreakpointsTool = defineTool<ClearExceptionBreakpointsParams>({
  name: 'clear_exception_breakpoints',
  description: 'Observe-first, hook-preferred, breakpoint-last clear of debugger exception pause mode.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    await context.runtime.getExceptionBreakpointManager().clear();
    const snapshot = buildDebuggerFinishingSnapshot(context, {
      exceptionBreakpointMode: 'none',
      notes: ['Exception breakpoint mode cleared.']
    });
    const evidenceWritten = await recordDebuggerFinishing(context, {
      evidence: {
        kind: 'debugger_exception_breakpoints',
        mode: 'none'
      },
      snapshot,
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });

    return {
      cleared: true,
      evidenceWritten,
      mode: 'none'
    };
  }
});
