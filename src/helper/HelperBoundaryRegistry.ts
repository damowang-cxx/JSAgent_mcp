import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { HelperBoundaryResult, StoredHelperBoundary } from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function makeBoundaryId(result: HelperBoundaryResult): string {
  const safeName = result.helperName.replace(/[^A-Za-z0-9_$.-]+/g, '-').slice(0, 80) || 'helper';
  return `${safeName}-${Date.now().toString(36)}`;
}

function isStoredBoundary(value: unknown): value is StoredHelperBoundary {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'boundaryId' in value &&
      'createdAt' in value &&
      'result' in value
  );
}

export class HelperBoundaryRegistry {
  private lastBoundary: StoredHelperBoundary | null = null;

  constructor(private readonly evidenceStore: EvidenceStore) {}

  setLast(result: HelperBoundaryResult): void {
    this.lastBoundary = {
      boundaryId: makeBoundaryId(result),
      createdAt: nowIso(),
      result
    };
  }

  getLast(): HelperBoundaryResult | null {
    return this.lastBoundary?.result ?? null;
  }

  getLastStored(): StoredHelperBoundary | null {
    return this.lastBoundary ? { ...this.lastBoundary } : null;
  }

  async storeToTask(taskId: string, result: HelperBoundaryResult): Promise<StoredHelperBoundary> {
    const stored: StoredHelperBoundary = {
      boundaryId: makeBoundaryId(result),
      createdAt: nowIso(),
      result,
      taskId
    };
    this.lastBoundary = stored;
    await this.evidenceStore.writeSnapshot(taskId, `helper-boundary/${stored.boundaryId}`, stored);
    await this.evidenceStore.writeSnapshot(taskId, 'helper-boundary/latest', stored);
    return stored;
  }

  async listFromTask(taskId: string): Promise<StoredHelperBoundary[]> {
    const snapshots = await this.evidenceStore.listSnapshots(taskId);
    const names = snapshots.filter((name) => name === 'helper-boundary/latest' || name.startsWith('helper-boundary/'));
    const items: StoredHelperBoundary[] = [];

    for (const name of names) {
      const snapshot = await this.evidenceStore.readSnapshot(taskId, name);
      if (isStoredBoundary(snapshot)) {
        items.push(snapshot);
      }
    }

    const seen = new Set<string>();
    return items
      .filter((item) => {
        if (seen.has(item.boundaryId)) {
          return false;
        }
        seen.add(item.boundaryId);
        return true;
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
}
