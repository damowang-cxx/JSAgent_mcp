import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { FixtureCandidateResult, StoredFixtureCandidate } from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function makeFixtureId(result: FixtureCandidateResult): string {
  const safeName = result.targetName.replace(/[^A-Za-z0-9_$.-]+/g, '-').slice(0, 80) || 'fixture';
  return result.fixtureId || `${safeName}-${Date.now().toString(36)}`;
}

function isStoredFixtureCandidate(value: unknown): value is StoredFixtureCandidate {
  return Boolean(value && typeof value === 'object' && 'fixtureId' in value && 'createdAt' in value && 'result' in value);
}

export class FixtureCandidateRegistry {
  private lastFixture: StoredFixtureCandidate | null = null;

  constructor(private readonly evidenceStore: EvidenceStore) {}

  setLast(result: FixtureCandidateResult): void {
    this.lastFixture = {
      createdAt: nowIso(),
      fixtureId: makeFixtureId(result),
      result
    };
  }

  getLast(): FixtureCandidateResult | null {
    return this.lastFixture?.result ?? null;
  }

  getLastStored(): StoredFixtureCandidate | null {
    return this.lastFixture ? { ...this.lastFixture } : null;
  }

  async storeToTask(taskId: string, result: FixtureCandidateResult): Promise<StoredFixtureCandidate> {
    const stored: StoredFixtureCandidate = {
      createdAt: nowIso(),
      fixtureId: makeFixtureId(result),
      result,
      taskId
    };
    this.lastFixture = stored;
    await this.evidenceStore.writeSnapshot(taskId, `boundary-fixture/${stored.fixtureId}`, stored);
    await this.evidenceStore.writeSnapshot(taskId, 'boundary-fixture/latest', stored);
    return stored;
  }

  async listFromTask(taskId: string): Promise<StoredFixtureCandidate[]> {
    const snapshots = await this.evidenceStore.listSnapshots(taskId);
    const names = snapshots.filter((name) => name === 'boundary-fixture/latest' || name.startsWith('boundary-fixture/'));
    const items: StoredFixtureCandidate[] = [];

    for (const name of names) {
      const snapshot = await this.evidenceStore.readSnapshot(taskId, name);
      if (isStoredFixtureCandidate(snapshot)) {
        items.push(snapshot);
      }
    }

    const seen = new Set<string>();
    return items
      .filter((item) => {
        if (seen.has(item.fixtureId)) {
          return false;
        }
        seen.add(item.fixtureId);
        return true;
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
}
