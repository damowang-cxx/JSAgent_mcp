import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { TaskManifestManager } from '../task/TaskManifestManager.js';
import type { DebuggerFinishingSnapshot } from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function isDebuggerFinishingSnapshot(value: unknown): value is DebuggerFinishingSnapshot {
  return Boolean(value && typeof value === 'object');
}

export class DebuggerFinishingRegistry {
  private lastSnapshot: DebuggerFinishingSnapshot | null = null;

  constructor(private readonly deps: {
    evidenceStore: EvidenceStore;
    taskManifestManager: TaskManifestManager;
  }) {}

  setLast(snapshot: DebuggerFinishingSnapshot): void {
    this.lastSnapshot = mergeSnapshots(this.lastSnapshot, snapshot);
  }

  getLast(): DebuggerFinishingSnapshot | null {
    return this.lastSnapshot ? cloneSnapshot(this.lastSnapshot) : null;
  }

  async storeToTask(taskId: string, snapshot: DebuggerFinishingSnapshot): Promise<void> {
    await this.deps.evidenceStore.openTask({ taskId });
    const existing = await this.readFromTask(taskId);
    const merged = mergeSnapshots(existing ?? this.lastSnapshot, snapshot);
    this.lastSnapshot = merged;
    await this.deps.evidenceStore.writeSnapshot(taskId, 'debugger-finishing/latest', merged);
    await this.deps.taskManifestManager.ensureTask(taskId);
    await this.deps.taskManifestManager.updatePointers(taskId, {
      debuggerFinishing: 'debugger-finishing/latest'
    });
  }

  async readFromTask(taskId: string): Promise<DebuggerFinishingSnapshot | null> {
    try {
      const snapshot = await this.deps.evidenceStore.readSnapshot(taskId, 'debugger-finishing/latest');
      return isDebuggerFinishingSnapshot(snapshot) ? cloneSnapshot(snapshot) : null;
    } catch {
      return null;
    }
  }
}

function mergeSnapshots(
  current: DebuggerFinishingSnapshot | null,
  patch: DebuggerFinishingSnapshot
): DebuggerFinishingSnapshot {
  return {
    ...(current ?? {}),
    ...patch,
    createdAt: nowIso(),
    currentDebugTargetId: patch.currentDebugTargetId !== undefined ? patch.currentDebugTargetId : current?.currentDebugTargetId ?? null,
    exceptionBreakpointMode: patch.exceptionBreakpointMode ?? current?.exceptionBreakpointMode,
    lastDebugTargets: patch.lastDebugTargets ? patch.lastDebugTargets.map((item) => ({ ...item })) : current?.lastDebugTargets,
    lastWatchValues: patch.lastWatchValues ? patch.lastWatchValues.map((item) => ({ ...item })) : current?.lastWatchValues,
    watchExpressions: patch.watchExpressions ? patch.watchExpressions.map((item) => ({ ...item })) : current?.watchExpressions,
    notes: [
      ...(current?.notes ?? []),
      ...(patch.notes ?? [])
    ].slice(-80)
  };
}

function cloneSnapshot(snapshot: DebuggerFinishingSnapshot): DebuggerFinishingSnapshot {
  return {
    ...snapshot,
    lastDebugTargets: snapshot.lastDebugTargets?.map((item) => ({ ...item })),
    lastWatchValues: snapshot.lastWatchValues?.map((item) => ({ ...item })),
    notes: snapshot.notes ? [...snapshot.notes] : undefined,
    watchExpressions: snapshot.watchExpressions?.map((item) => ({ ...item }))
  };
}
