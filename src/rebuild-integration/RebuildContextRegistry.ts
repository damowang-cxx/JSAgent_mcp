import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { RebuildContext, StoredRebuildContextSnapshot } from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function isStoredRebuildContextSnapshot(value: unknown): value is StoredRebuildContextSnapshot {
  return Boolean(value && typeof value === 'object' && 'createdAt' in value && 'result' in value);
}

export class RebuildContextRegistry {
  private lastContext: StoredRebuildContextSnapshot | null = null;

  constructor(private readonly evidenceStore: EvidenceStore) {}

  setLast(result: RebuildContext): void {
    this.lastContext = {
      createdAt: nowIso(),
      result
    };
  }

  getLast(): RebuildContext | null {
    return this.lastContext?.result ?? null;
  }

  async storeToTask(taskId: string, result: RebuildContext): Promise<StoredRebuildContextSnapshot> {
    const stored: StoredRebuildContextSnapshot = {
      createdAt: nowIso(),
      result,
      taskId
    };
    this.lastContext = stored;
    await this.evidenceStore.writeSnapshot(taskId, 'rebuild-context/latest', stored);
    return stored;
  }

  async readFromTask(taskId: string): Promise<StoredRebuildContextSnapshot | null> {
    try {
      const snapshot = await this.evidenceStore.readSnapshot(taskId, 'rebuild-context/latest');
      return isStoredRebuildContextSnapshot(snapshot) ? snapshot : null;
    } catch {
      return null;
    }
  }
}
