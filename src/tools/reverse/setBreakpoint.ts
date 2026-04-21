import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool, type ToolContext } from '../ToolDefinition.js';
import type { ManagedBreakpoint } from '../../debugger/types.js';

const schema = z.object({
  columnNumber: z.number().int().min(0).optional(),
  lineNumber: z.number().int().min(1),
  targetUrl: z.string().optional(),
  taskId: z.string().optional(),
  url: z.string(),
  writeEvidence: z.boolean().optional()
});

type SetBreakpointParams = z.infer<typeof schema>;

export const setBreakpointTool = defineTool<SetBreakpointParams>({
  name: 'set_breakpoint',
  description: 'Breakpoint-last debugger fallback: set a CDP breakpoint by script URL and 1-based line after hook/replay evidence is insufficient.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const manager = context.runtime.getDebuggerSessionManager();
    const breakpoint = await manager.setBreakpointByUrl({
      columnNumber: params.columnNumber,
      lineNumber: params.lineNumber,
      url: params.url
    });
    context.runtime.getBreakpointRegistry().upsert(breakpoint);

    const evidenceWritten = await writeBreakpointEvidence(context, {
      breakpoint,
      kind: 'debugger_breakpoint_set',
      targetUrl: params.targetUrl,
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });

    return {
      breakpoint,
      evidenceWritten,
      notes: [
        'Breakpoint set as a fallback debugger step. Prefer create_hook, run_capture_recipe, and helper boundary evidence before adding more breakpoints.'
      ]
    };
  }
});

export async function writeBreakpointEvidence(
  context: ToolContext,
  input: {
    breakpoint?: ManagedBreakpoint;
    kind: 'debugger_breakpoint_set' | 'debugger_breakpoint_removed';
    targetUrl?: string;
    taskId?: string;
    writeEvidence?: boolean;
  }
): Promise<boolean> {
  if (!input.taskId || !input.writeEvidence) {
    return false;
  }

  const evidenceStore = context.runtime.getEvidenceStore();
  await evidenceStore.openTask({
    targetUrl: input.targetUrl,
    taskId: input.taskId
  });
  await evidenceStore.appendLog(input.taskId, 'runtime-evidence', {
    breakpoint: input.breakpoint ?? null,
    kind: input.kind
  });
  await context.runtime.getBreakpointRegistry().storeToTask(
    input.taskId,
    context.runtime.getDebuggerSessionManager().listBreakpoints()
  );
  await context.runtime.getTaskManifestManager().ensureTask(input.taskId, {
    targetUrl: input.targetUrl
  });
  await context.runtime.getTaskManifestManager().updatePointers(input.taskId, {
    debuggerBreakpoints: 'debugger/breakpoints-latest'
  });
  return true;
}
