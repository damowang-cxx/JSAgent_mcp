import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { DependencyWindowResult, StoredDependencyWindow } from './types.js';
import { makeWindowId } from './WindowHeuristics.js';

function nowIso(): string {
  return new Date().toISOString();
}

function isStoredDependencyWindow(value: unknown): value is StoredDependencyWindow {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'windowId' in value &&
      'createdAt' in value &&
      'result' in value
  );
}

export class DependencyWindowRegistry {
  private lastWindow: StoredDependencyWindow | null = null;

  constructor(private readonly evidenceStore: EvidenceStore) {}

  setLast(result: DependencyWindowResult): void {
    this.lastWindow = {
      createdAt: nowIso(),
      result,
      windowId: result.windowId || makeWindowId(result.targetName)
    };
  }

  getLast(): DependencyWindowResult | null {
    return this.lastWindow?.result ?? null;
  }

  getLastStored(): StoredDependencyWindow | null {
    return this.lastWindow ? { ...this.lastWindow } : null;
  }

  async storeToTask(taskId: string, result: DependencyWindowResult): Promise<StoredDependencyWindow> {
    const stored: StoredDependencyWindow = {
      createdAt: nowIso(),
      result,
      taskId,
      windowId: result.windowId || makeWindowId(result.targetName)
    };
    this.lastWindow = stored;
    await this.evidenceStore.writeSnapshot(taskId, `dependency-window/${stored.windowId}`, stored);
    await this.evidenceStore.writeSnapshot(taskId, 'dependency-window/latest', stored);
    return stored;
  }

  async listFromTask(taskId: string): Promise<StoredDependencyWindow[]> {
    const snapshots = await this.evidenceStore.listSnapshots(taskId);
    const names = snapshots.filter((name) => name === 'dependency-window/latest' || name.startsWith('dependency-window/'));
    const items: StoredDependencyWindow[] = [];

    for (const name of names) {
      const snapshot = await this.evidenceStore.readSnapshot(taskId, name);
      if (isStoredDependencyWindow(snapshot)) {
        items.push(snapshot);
      }
    }

    const seen = new Set<string>();
    return items
      .filter((item) => {
        if (seen.has(item.windowId)) {
          return false;
        }
        seen.add(item.windowId);
        return true;
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
}
