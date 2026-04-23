import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { BrowserOpsSnapshot } from './types.js';

function isBrowserOpsSnapshot(value: unknown): value is BrowserOpsSnapshot {
  return Boolean(value && typeof value === 'object');
}

export class BrowserOpsRegistry {
  private lastSnapshot: BrowserOpsSnapshot | null = null;

  constructor(private readonly evidenceStore: EvidenceStore) {}

  setLastSnapshot(snapshot: BrowserOpsSnapshot): void {
    this.lastSnapshot = snapshot;
  }

  mergeLastSnapshot(patch: BrowserOpsSnapshot): BrowserOpsSnapshot {
    this.lastSnapshot = {
      ...this.lastSnapshot,
      ...patch,
      notes: [
        ...(this.lastSnapshot?.notes ?? []),
        ...(patch.notes ?? [])
      ].slice(-40)
    };
    return this.lastSnapshot;
  }

  getLastSnapshot(): BrowserOpsSnapshot | null {
    return this.lastSnapshot;
  }

  async storeToTask(taskId: string, snapshot: BrowserOpsSnapshot): Promise<void> {
    this.lastSnapshot = snapshot;
    await this.evidenceStore.writeSnapshot(taskId, 'browser-ops/latest', snapshot);
  }

  async readFromTask(taskId: string): Promise<BrowserOpsSnapshot | null> {
    try {
      const snapshot = await this.evidenceStore.readSnapshot(taskId, 'browser-ops/latest');
      return isBrowserOpsSnapshot(snapshot) ? snapshot : null;
    } catch {
      return null;
    }
  }
}
