import { AppError } from '../../core/errors.js';
import type { BrowserOpsSnapshot, SavedSessionState } from '../../browser-ops/types.js';
import type { ToolContext } from '../ToolDefinition.js';

export async function recordBrowserOps(
  context: ToolContext,
  input: {
    taskId?: string;
    writeEvidence?: boolean;
    evidence: Record<string, unknown>;
    snapshotPatch: BrowserOpsSnapshot;
  }
): Promise<boolean> {
  const snapshot = context.runtime.getBrowserOpsRegistry().mergeLastSnapshot({
    ...input.snapshotPatch,
    activePreloadScripts: context.runtime.getPreloadScriptRegistry().list(),
    activeSessionStates: context.runtime.getSessionStateManager().list(),
    currentUserAgent: context.runtime.getStealthPresetRegistry().getCurrentUserAgent(),
    lastStealthPreset: context.runtime.getStealthPresetRegistry().getLastPreset()
  });

  if (!input.taskId || !input.writeEvidence) {
    return false;
  }

  const evidenceStore = context.runtime.getEvidenceStore();
  await evidenceStore.openTask({ taskId: input.taskId });
  await evidenceStore.appendLog(input.taskId, 'runtime-evidence', input.evidence);
  await context.runtime.getBrowserOpsRegistry().storeToTask(input.taskId, snapshot);
  await context.runtime.getTaskManifestManager().ensureTask(input.taskId);
  await context.runtime.getTaskManifestManager().updatePointers(input.taskId, {
    browserOps: 'browser-ops/latest'
  });
  return true;
}

export async function writeSessionStateArtifact(
  context: ToolContext,
  taskId: string | undefined,
  state: SavedSessionState
): Promise<void> {
  if (!taskId) {
    return;
  }
  await context.runtime.getEvidenceStore().openTask({ taskId });
  await context.runtime.getEvidenceStore().writeSnapshot(taskId, `browser-ops/session-states/${state.sessionId}`, state);
}

export async function readBrowserOpsSnapshot(
  context: ToolContext,
  params: {
    taskId?: string;
    source?: 'runtime-last' | 'task-artifact';
  }
): Promise<{ snapshot: BrowserOpsSnapshot | null; source: 'runtime-last' | 'task-artifact' }> {
  if (params.source === 'task-artifact' && !params.taskId) {
    throw new AppError('TASK_ID_REQUIRED', 'source=task-artifact requires taskId.');
  }

  if (params.taskId && params.source !== 'runtime-last') {
    const snapshot = await context.runtime.getBrowserOpsRegistry().readFromTask(params.taskId);
    if (snapshot) {
      return {
        snapshot,
        source: 'task-artifact'
      };
    }
    if (params.source === 'task-artifact') {
      return {
        snapshot: null,
        source: 'task-artifact'
      };
    }
  }

  return {
    snapshot: context.runtime.getBrowserOpsRegistry().getLastSnapshot(),
    source: 'runtime-last'
  };
}
