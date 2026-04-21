import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { CompareAnchorSelectionResult, StoredCompareAnchorSnapshot } from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function isStoredCompareAnchorSnapshot(value: unknown): value is StoredCompareAnchorSnapshot {
  return Boolean(value && typeof value === 'object' && 'createdAt' in value && 'result' in value);
}

export class CompareAnchorRegistry {
  private lastResult: StoredCompareAnchorSnapshot | null = null;

  constructor(private readonly evidenceStore: EvidenceStore) {}

  setLast(result: CompareAnchorSelectionResult): void {
    this.lastResult = {
      createdAt: nowIso(),
      result
    };
  }

  getLast(): CompareAnchorSelectionResult | null {
    return this.lastResult?.result ?? null;
  }

  async storeToTask(taskId: string, result: CompareAnchorSelectionResult): Promise<StoredCompareAnchorSnapshot> {
    const stored: StoredCompareAnchorSnapshot = {
      createdAt: nowIso(),
      result,
      taskId
    };
    this.lastResult = stored;
    await this.evidenceStore.writeSnapshot(taskId, 'compare-anchor/latest', stored);
    return stored;
  }

  async readFromTask(taskId: string): Promise<StoredCompareAnchorSnapshot | null> {
    try {
      const snapshot = await this.evidenceStore.readSnapshot(taskId, 'compare-anchor/latest');
      return isStoredCompareAnchorSnapshot(snapshot) ? snapshot : null;
    } catch {
      return null;
    }
  }
}
