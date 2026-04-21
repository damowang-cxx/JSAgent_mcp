import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { writeBreakpointEvidence } from './setBreakpoint.js';

const schema = z.object({
  breakpointId: z.string(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type RemoveBreakpointParams = z.infer<typeof schema>;

export const removeBreakpointTool = defineTool<RemoveBreakpointParams>({
  name: 'remove_breakpoint',
  description: 'Remove a managed CDP debugger breakpoint; this does not affect existing XHR watchpoints or hook captures.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const removed = await context.runtime.getDebuggerSessionManager().removeBreakpoint(params.breakpointId);
    context.runtime.getBreakpointRegistry().setItems(context.runtime.getDebuggerSessionManager().listBreakpoints());
    const evidenceWritten = await writeBreakpointEvidence(context, {
      kind: 'debugger_breakpoint_removed',
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });

    return {
      evidenceWritten,
      remaining: context.runtime.getBreakpointRegistry().getItems(),
      removed
    };
  }
});
