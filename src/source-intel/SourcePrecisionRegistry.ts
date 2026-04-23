import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { TaskManifestManager } from '../task/TaskManifestManager.js';
import type { SourcePrecisionSnapshot } from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function isSourcePrecisionSnapshot(value: unknown): value is SourcePrecisionSnapshot {
  return Boolean(value && typeof value === 'object');
}

export class SourcePrecisionRegistry {
  private lastSnapshot: SourcePrecisionSnapshot | null = null;

  constructor(private readonly deps: {
    evidenceStore: EvidenceStore;
    taskManifestManager: TaskManifestManager;
  }) {}

  setLast(snapshot: SourcePrecisionSnapshot): void {
    this.lastSnapshot = mergeSnapshots(this.lastSnapshot, snapshot);
  }

  getLast(): SourcePrecisionSnapshot | null {
    return this.lastSnapshot ? cloneSnapshot(this.lastSnapshot) : null;
  }

  async storeToTask(taskId: string, snapshot: SourcePrecisionSnapshot): Promise<void> {
    await this.deps.evidenceStore.openTask({ taskId });
    const existing = await this.readFromTask(taskId);
    const merged = mergeSnapshots(existing ?? this.lastSnapshot, snapshot);
    this.lastSnapshot = merged;
    await this.deps.evidenceStore.writeSnapshot(taskId, 'source-precision/latest', merged);
    await this.deps.taskManifestManager.ensureTask(taskId);
    await this.deps.taskManifestManager.updatePointers(taskId, {
      sourcePrecision: 'source-precision/latest'
    });
  }

  async readFromTask(taskId: string): Promise<SourcePrecisionSnapshot | null> {
    try {
      const snapshot = await this.deps.evidenceStore.readSnapshot(taskId, 'source-precision/latest');
      return isSourcePrecisionSnapshot(snapshot) ? cloneSnapshot(snapshot) : null;
    } catch {
      return null;
    }
  }
}

function mergeSnapshots(
  current: SourcePrecisionSnapshot | null,
  patch: SourcePrecisionSnapshot
): SourcePrecisionSnapshot {
  return {
    ...(current ?? {}),
    ...patch,
    createdAt: nowIso(),
    lastFindResult: patch.lastFindResult ? patch.lastFindResult.map((item) => ({ ...item })) : current?.lastFindResult,
    lastScriptList: patch.lastScriptList ? patch.lastScriptList.map((item) => ({ ...item })) : current?.lastScriptList,
    lastSearchResult: patch.lastSearchResult ? patch.lastSearchResult.map((item) => ({ ...item })) : current?.lastSearchResult,
    lastSourceRead: patch.lastSourceRead ? { ...patch.lastSourceRead } : current?.lastSourceRead,
    notes: [
      ...(current?.notes ?? []),
      ...(patch.notes ?? [])
    ].slice(-80)
  };
}

function cloneSnapshot(snapshot: SourcePrecisionSnapshot): SourcePrecisionSnapshot {
  return {
    ...snapshot,
    lastFindResult: snapshot.lastFindResult?.map((item) => ({ ...item })),
    lastScriptList: snapshot.lastScriptList?.map((item) => ({ ...item })),
    lastSearchResult: snapshot.lastSearchResult?.map((item) => ({ ...item })),
    lastSourceRead: snapshot.lastSourceRead ? { ...snapshot.lastSourceRead } : undefined,
    notes: snapshot.notes ? [...snapshot.notes] : undefined
  };
}
