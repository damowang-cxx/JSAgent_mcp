import { z } from 'zod';

import type { PausedStateSummary } from '../../debugger/types.js';
import { ToolCategory } from '../categories.js';
import { defineTool, type ToolContext } from '../ToolDefinition.js';

const schema = z.object({
  targetUrl: z.string().optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type PauseExecutionParams = z.infer<typeof schema>;

export const pauseExecutionTool = defineTool<PauseExecutionParams>({
  name: 'pause',
  description: 'Breakpoint-last debugger fallback: request Debugger.pause on the selected page and return only minimal paused state.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const manager = context.runtime.getDebuggerSessionManager();
    await manager.pause();
    const state = manager.getPausedState();
    const evidenceWritten = await writePausedEvidence(context, {
      kind: 'debugger_pause',
      state,
      targetUrl: params.targetUrl,
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });

    return {
      evidenceWritten,
      notes: state.isPaused
        ? ['Execution is paused. Scope variables are intentionally not included in Phase 18.']
        : ['Pause was requested, but the page did not enter paused state within the short wait window.'],
      pausedState: state.isPaused ? state : null,
      requested: true
    };
  }
});

export async function writePausedEvidence(
  context: ToolContext,
  input: {
    kind: 'debugger_pause' | 'debugger_resume';
    state?: PausedStateSummary;
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
    kind: input.kind,
    state: input.state ?? null
  });

  if (input.state) {
    await evidenceStore.writeSnapshot(input.taskId, 'debugger/paused-last', {
      createdAt: new Date().toISOString(),
      state: input.state,
      taskId: input.taskId
    });
    await context.runtime.getTaskManifestManager().ensureTask(input.taskId, {
      targetUrl: input.targetUrl
    });
    await context.runtime.getTaskManifestManager().updatePointers(input.taskId, {
      debuggerPaused: 'debugger/paused-last'
    });
  }

  return true;
}
