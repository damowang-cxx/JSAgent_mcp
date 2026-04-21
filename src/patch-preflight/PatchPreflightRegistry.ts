import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { PatchPreflightResult, StoredPatchPreflightSnapshot } from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function isStoredPatchPreflightSnapshot(value: unknown): value is StoredPatchPreflightSnapshot {
  return Boolean(value && typeof value === 'object' && 'createdAt' in value && 'result' in value);
}

export class PatchPreflightRegistry {
  private lastResult: StoredPatchPreflightSnapshot | null = null;

  constructor(private readonly evidenceStore: EvidenceStore) {}

  setLast(result: PatchPreflightResult): void {
    this.lastResult = {
      createdAt: nowIso(),
      result
    };
  }

  getLast(): PatchPreflightResult | null {
    return this.lastResult?.result ?? null;
  }

  async storeToTask(taskId: string, result: PatchPreflightResult): Promise<StoredPatchPreflightSnapshot> {
    const stored: StoredPatchPreflightSnapshot = {
      createdAt: nowIso(),
      result,
      taskId
    };
    this.lastResult = stored;
    await this.evidenceStore.writeSnapshot(taskId, 'patch-preflight/latest', stored);
    return stored;
  }

  async readFromTask(taskId: string): Promise<StoredPatchPreflightSnapshot | null> {
    try {
      const snapshot = await this.evidenceStore.readSnapshot(taskId, 'patch-preflight/latest');
      return isStoredPatchPreflightSnapshot(snapshot) ? snapshot : null;
    } catch {
      return null;
    }
  }
}
