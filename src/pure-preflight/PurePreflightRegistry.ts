import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { PurePreflightContext, StoredPurePreflightSnapshot } from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function isStoredPurePreflightSnapshot(value: unknown): value is StoredPurePreflightSnapshot {
  return Boolean(value && typeof value === 'object' && 'createdAt' in value && 'result' in value);
}

export class PurePreflightRegistry {
  private lastContext: StoredPurePreflightSnapshot | null = null;

  constructor(private readonly evidenceStore: EvidenceStore) {}

  setLast(result: PurePreflightContext): void {
    this.lastContext = {
      createdAt: nowIso(),
      result
    };
  }

  getLast(): PurePreflightContext | null {
    return this.lastContext?.result ?? null;
  }

  async storeToTask(taskId: string, result: PurePreflightContext): Promise<StoredPurePreflightSnapshot> {
    const stored: StoredPurePreflightSnapshot = {
      createdAt: nowIso(),
      result,
      taskId
    };
    this.lastContext = stored;
    await this.evidenceStore.writeSnapshot(taskId, 'pure-preflight/latest', stored);
    return stored;
  }

  async readFromTask(taskId: string): Promise<StoredPurePreflightSnapshot | null> {
    try {
      const snapshot = await this.evidenceStore.readSnapshot(taskId, 'pure-preflight/latest');
      return isStoredPurePreflightSnapshot(snapshot) ? snapshot : null;
    } catch {
      return null;
    }
  }
}
