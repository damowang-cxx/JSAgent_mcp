import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import type { StoredPausedSnapshot } from '../../debugger/types.js';
import { ToolCategory } from '../categories.js';
import { defineTool, type ToolContext } from '../ToolDefinition.js';
import { writePausedEvidence } from './pauseExecution.js';

const schema = z.object({
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type GetPausedInfoParams = z.infer<typeof schema>;

export const getPausedInfoTool = defineTool<GetPausedInfoParams>({
  name: 'get_paused_info',
  description: 'Return minimal debugger paused info only: reason, hit breakpoints, and call frame locations. No scopes or call-frame evaluation.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const resolved = await readPausedState(params, context);
    const evidenceWritten = await writePausedEvidence(context, {
      kind: 'debugger_pause',
      state: resolved.state,
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });

    return {
      evidenceWritten,
      source: resolved.source,
      state: resolved.state
    };
  }
});

async function readPausedState(
  params: GetPausedInfoParams,
  context: ToolContext
): Promise<{ source: 'runtime-last' | 'task-artifact'; state: StoredPausedSnapshot['state'] }> {
  if (params.source === 'task-artifact' && !params.taskId) {
    throw new AppError('TASK_ID_REQUIRED', 'get_paused_info with source=task-artifact requires taskId.');
  }

  if (params.taskId && params.source !== 'runtime-last') {
    try {
      const snapshot = await context.runtime.getEvidenceStore().readSnapshot(params.taskId, 'debugger/paused-last');
      if (isStoredPausedSnapshot(snapshot)) {
        return {
          source: 'task-artifact',
          state: snapshot.state
        };
      }
    } catch {
      if (params.source === 'task-artifact') {
        throw new AppError('DEBUGGER_PAUSED_SNAPSHOT_NOT_FOUND', `No debugger paused snapshot found for task ${params.taskId}.`);
      }
    }
    if (params.source === 'task-artifact') {
      throw new AppError('DEBUGGER_PAUSED_SNAPSHOT_NOT_FOUND', `No debugger paused snapshot found for task ${params.taskId}.`);
    }
  }

  await context.runtime.getDebuggerSessionManager().ensureAttached();
  return {
    source: 'runtime-last',
    state: context.runtime.getDebuggerSessionManager().getPausedState()
  };
}

function isStoredPausedSnapshot(value: unknown): value is StoredPausedSnapshot {
  return Boolean(value && typeof value === 'object' && 'createdAt' in value && 'state' in value);
}
