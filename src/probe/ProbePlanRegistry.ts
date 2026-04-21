import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { ProbePlan, StoredProbePlan } from './types.js';
import { makeProbePlanId } from '../window/WindowHeuristics.js';

function nowIso(): string {
  return new Date().toISOString();
}

function isStoredProbePlan(value: unknown): value is StoredProbePlan {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'planId' in value &&
      'createdAt' in value &&
      'result' in value
  );
}

export class ProbePlanRegistry {
  private lastPlan: StoredProbePlan | null = null;

  constructor(private readonly evidenceStore: EvidenceStore) {}

  setLast(result: ProbePlan): void {
    this.lastPlan = {
      createdAt: nowIso(),
      planId: result.planId || makeProbePlanId(result.targetName),
      result
    };
  }

  getLast(): ProbePlan | null {
    return this.lastPlan?.result ?? null;
  }

  getLastStored(): StoredProbePlan | null {
    return this.lastPlan ? { ...this.lastPlan } : null;
  }

  async storeToTask(taskId: string, result: ProbePlan): Promise<StoredProbePlan> {
    const stored: StoredProbePlan = {
      createdAt: nowIso(),
      planId: result.planId || makeProbePlanId(result.targetName),
      result,
      taskId
    };
    this.lastPlan = stored;
    await this.evidenceStore.writeSnapshot(taskId, `scenario-probe/${stored.planId}`, stored);
    await this.evidenceStore.writeSnapshot(taskId, 'scenario-probe/latest', stored);
    return stored;
  }

  async listFromTask(taskId: string): Promise<StoredProbePlan[]> {
    const snapshots = await this.evidenceStore.listSnapshots(taskId);
    const names = snapshots.filter((name) => name === 'scenario-probe/latest' || name.startsWith('scenario-probe/'));
    const items: StoredProbePlan[] = [];

    for (const name of names) {
      const snapshot = await this.evidenceStore.readSnapshot(taskId, name);
      if (isStoredProbePlan(snapshot)) {
        items.push(snapshot);
      }
    }

    const seen = new Set<string>();
    return items
      .filter((item) => {
        if (seen.has(item.planId)) {
          return false;
        }
        seen.add(item.planId);
        return true;
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
}
