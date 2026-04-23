import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { TaskManifestManager } from '../task/TaskManifestManager.js';
import type { AstSubstrateSnapshot } from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function isAstSubstrateSnapshot(value: unknown): value is AstSubstrateSnapshot {
  return Boolean(value && typeof value === 'object');
}

export class AstSubstrateRegistry {
  private lastSnapshot: AstSubstrateSnapshot | null = null;

  constructor(private readonly deps: {
    evidenceStore: EvidenceStore;
    taskManifestManager: TaskManifestManager;
  }) {}

  setLast(snapshot: AstSubstrateSnapshot): void {
    this.lastSnapshot = mergeSnapshots(this.lastSnapshot, snapshot);
  }

  getLast(): AstSubstrateSnapshot | null {
    return this.lastSnapshot ? cloneSnapshot(this.lastSnapshot) : null;
  }

  async storeToTask(taskId: string, snapshot: AstSubstrateSnapshot): Promise<void> {
    await this.deps.evidenceStore.openTask({ taskId });
    const existing = await this.readFromTask(taskId);
    const merged = mergeSnapshots(existing ?? this.lastSnapshot, snapshot);
    this.lastSnapshot = merged;
    await this.deps.evidenceStore.writeSnapshot(taskId, 'ast-substrate/latest', merged);
    await this.deps.taskManifestManager.ensureTask(taskId);
    await this.deps.taskManifestManager.updatePointers(taskId, {
      astSubstrate: 'ast-substrate/latest'
    });
  }

  async readFromTask(taskId: string): Promise<AstSubstrateSnapshot | null> {
    try {
      const snapshot = await this.deps.evidenceStore.readSnapshot(taskId, 'ast-substrate/latest');
      return isAstSubstrateSnapshot(snapshot) ? cloneSnapshot(snapshot) : null;
    } catch {
      return null;
    }
  }
}

function mergeSnapshots(current: AstSubstrateSnapshot | null, patch: AstSubstrateSnapshot): AstSubstrateSnapshot {
  return {
    ...(current ?? {}),
    ...patch,
    createdAt: nowIso(),
    foundReferences: patch.foundReferences ? patch.foundReferences.map((item) => ({ ...item })) : current?.foundReferences,
    locatedFunctions: patch.locatedFunctions ? patch.locatedFunctions.map((item) => ({ ...item })) : current?.locatedFunctions,
    notes: [
      ...(current?.notes ?? []),
      ...(patch.notes ?? [])
    ].slice(-80),
    rewritePreviews: patch.rewritePreviews ? patch.rewritePreviews.map((item) => ({ ...item, notes: [...item.notes] })) : current?.rewritePreviews
  };
}

function cloneSnapshot(snapshot: AstSubstrateSnapshot): AstSubstrateSnapshot {
  return {
    ...snapshot,
    foundReferences: snapshot.foundReferences?.map((item) => ({ ...item })),
    locatedFunctions: snapshot.locatedFunctions?.map((item) => ({ ...item })),
    notes: snapshot.notes ? [...snapshot.notes] : undefined,
    rewritePreviews: snapshot.rewritePreviews?.map((item) => ({ ...item, notes: [...item.notes] }))
  };
}
