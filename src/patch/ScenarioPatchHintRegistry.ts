import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { ScenarioPatchHintSet, StoredScenarioPatchHintSet } from './types.scenario.js';

function nowIso(): string {
  return new Date().toISOString();
}

function makeSetId(result: ScenarioPatchHintSet): string {
  const safeName = result.targetName.replace(/[^A-Za-z0-9_$.-]+/g, '-').slice(0, 80) || 'patch-hints';
  return result.setId || `${safeName}-${Date.now().toString(36)}`;
}

function isStoredScenarioPatchHintSet(value: unknown): value is StoredScenarioPatchHintSet {
  return Boolean(value && typeof value === 'object' && 'setId' in value && 'createdAt' in value && 'result' in value);
}

export class ScenarioPatchHintRegistry {
  private lastHintSet: StoredScenarioPatchHintSet | null = null;

  constructor(private readonly evidenceStore: EvidenceStore) {}

  setLast(result: ScenarioPatchHintSet): void {
    this.lastHintSet = {
      createdAt: nowIso(),
      result,
      setId: makeSetId(result)
    };
  }

  getLast(): ScenarioPatchHintSet | null {
    return this.lastHintSet?.result ?? null;
  }

  getLastStored(): StoredScenarioPatchHintSet | null {
    return this.lastHintSet ? { ...this.lastHintSet } : null;
  }

  async storeToTask(taskId: string, result: ScenarioPatchHintSet): Promise<StoredScenarioPatchHintSet> {
    const stored: StoredScenarioPatchHintSet = {
      createdAt: nowIso(),
      result,
      setId: makeSetId(result),
      taskId
    };
    this.lastHintSet = stored;
    await this.evidenceStore.writeSnapshot(taskId, `scenario-patch-hints/${stored.setId}`, stored);
    await this.evidenceStore.writeSnapshot(taskId, 'scenario-patch-hints/latest', stored);
    return stored;
  }

  async listFromTask(taskId: string): Promise<StoredScenarioPatchHintSet[]> {
    const snapshots = await this.evidenceStore.listSnapshots(taskId);
    const names = snapshots.filter((name) => name === 'scenario-patch-hints/latest' || name.startsWith('scenario-patch-hints/'));
    const items: StoredScenarioPatchHintSet[] = [];

    for (const name of names) {
      const snapshot = await this.evidenceStore.readSnapshot(taskId, name);
      if (isStoredScenarioPatchHintSet(snapshot)) {
        items.push(snapshot);
      }
    }

    const seen = new Set<string>();
    return items
      .filter((item) => {
        if (seen.has(item.setId)) {
          return false;
        }
        seen.add(item.setId);
        return true;
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
}
