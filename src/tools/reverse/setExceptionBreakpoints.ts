import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { buildDebuggerFinishingSnapshot, recordDebuggerFinishing } from './debuggerFinishingToolHelpers.js';

const schema = z.object({
  mode: z.enum(['none', 'uncaught', 'caught', 'all']),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type SetExceptionBreakpointsParams = z.infer<typeof schema>;

export const setExceptionBreakpointsTool = defineTool<SetExceptionBreakpointsParams>({
  name: 'set_exception_breakpoints',
  description: 'Observe-first, hook-preferred, breakpoint-last debugger finishing fallback: set CDP exception pause mode only when precise debugger escalation is needed.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const mode = await context.runtime.getExceptionBreakpointManager().setMode(params.mode);
    const snapshot = buildDebuggerFinishingSnapshot(context, {
      exceptionBreakpointMode: mode,
      notes: [
        mode === 'caught'
          ? 'Requested caught exception mode; Chrome CDP approximates this with pause-on-all exceptions.'
          : 'Exception breakpoint mode updated through Debugger.setPauseOnExceptions.'
      ]
    });
    const evidenceWritten = await recordDebuggerFinishing(context, {
      evidence: {
        kind: 'debugger_exception_breakpoints',
        mode
      },
      snapshot,
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });

    return {
      evidenceWritten,
      mode
    };
  }
});
