import { AppError } from '../../core/errors.js';
import type { DebuggerFinishingSnapshot } from '../../debugger/types.js';
import type { ToolContext } from '../ToolDefinition.js';

export function buildDebuggerFinishingSnapshot(
  context: ToolContext,
  patch: DebuggerFinishingSnapshot = {}
): DebuggerFinishingSnapshot {
  return {
    exceptionBreakpointMode: context.runtime.getExceptionBreakpointManager().getMode(),
    watchExpressions: context.runtime.getWatchExpressionRegistry().list(),
    currentDebugTargetId: context.runtime.getDebuggerSessionManager().getCurrentDebugTargetId(),
    ...patch,
    notes: patch.notes ?? ['Debugger finishing is a precise fallback after hook/replay/scenario/source precision evidence.']
  };
}

export async function recordDebuggerFinishing(
  context: ToolContext,
  input: {
    taskId?: string;
    writeEvidence?: boolean;
    evidence: Record<string, unknown>;
    snapshot: DebuggerFinishingSnapshot;
  }
): Promise<boolean> {
  context.runtime.getDebuggerFinishingRegistry().setLast(input.snapshot);

  if (!input.taskId || !input.writeEvidence) {
    return false;
  }

  const evidenceStore = context.runtime.getEvidenceStore();
  await evidenceStore.openTask({ taskId: input.taskId });
  await evidenceStore.appendLog(input.taskId, 'runtime-evidence', input.evidence);
  await context.runtime.getDebuggerFinishingRegistry().storeToTask(input.taskId, input.snapshot);
  return true;
}

export async function readDebuggerFinishingSnapshot(
  context: ToolContext,
  params: {
    taskId?: string;
    source?: 'runtime-last' | 'task-artifact';
  },
  toolName: string
): Promise<{ snapshot: DebuggerFinishingSnapshot | null; source: 'runtime-last' | 'task-artifact' }> {
  if (params.source === 'task-artifact' && !params.taskId) {
    throw new AppError('TASK_ID_REQUIRED', `${toolName} with source=task-artifact requires taskId.`);
  }

  if (params.taskId && params.source !== 'runtime-last') {
    const snapshot = await context.runtime.getDebuggerFinishingRegistry().readFromTask(params.taskId);
    if (snapshot) {
      return {
        snapshot,
        source: 'task-artifact'
      };
    }
    if (params.source === 'task-artifact') {
      throw new AppError('DEBUGGER_FINISHING_SNAPSHOT_NOT_FOUND', `No debugger-finishing/latest snapshot found for task ${params.taskId}.`);
    }
  }

  return {
    snapshot: context.runtime.getDebuggerFinishingRegistry().getLast(),
    source: 'runtime-last'
  };
}
