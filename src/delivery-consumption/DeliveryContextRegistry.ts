import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type {
  DeliveryContext,
  RegressionContext,
  StoredDeliveryContextSnapshot,
  StoredRegressionContextSnapshot
} from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function isStoredRegressionContextSnapshot(value: unknown): value is StoredRegressionContextSnapshot {
  return Boolean(value && typeof value === 'object' && 'createdAt' in value && 'result' in value);
}

function isStoredDeliveryContextSnapshot(value: unknown): value is StoredDeliveryContextSnapshot {
  return Boolean(value && typeof value === 'object' && 'createdAt' in value && 'result' in value);
}

export class DeliveryContextRegistry {
  private lastRegressionContext: StoredRegressionContextSnapshot | null = null;
  private lastDeliveryContext: StoredDeliveryContextSnapshot | null = null;

  constructor(private readonly evidenceStore: EvidenceStore) {}

  setLastRegressionContext(result: RegressionContext): void {
    this.lastRegressionContext = {
      createdAt: nowIso(),
      result
    };
  }

  getLastRegressionContext(): RegressionContext | null {
    return this.lastRegressionContext?.result ?? null;
  }

  setLastDeliveryContext(result: DeliveryContext): void {
    this.lastDeliveryContext = {
      createdAt: nowIso(),
      result
    };
  }

  getLastDeliveryContext(): DeliveryContext | null {
    return this.lastDeliveryContext?.result ?? null;
  }

  async storeRegressionToTask(taskId: string, result: RegressionContext): Promise<StoredRegressionContextSnapshot> {
    const stored: StoredRegressionContextSnapshot = {
      createdAt: nowIso(),
      result,
      taskId
    };
    this.lastRegressionContext = stored;
    await this.evidenceStore.writeSnapshot(taskId, 'regression-context/latest', stored);
    return stored;
  }

  async readRegressionFromTask(taskId: string): Promise<StoredRegressionContextSnapshot | null> {
    try {
      const snapshot = await this.evidenceStore.readSnapshot(taskId, 'regression-context/latest');
      return isStoredRegressionContextSnapshot(snapshot) ? snapshot : null;
    } catch {
      return null;
    }
  }

  async storeDeliveryToTask(taskId: string, result: DeliveryContext): Promise<StoredDeliveryContextSnapshot> {
    const stored: StoredDeliveryContextSnapshot = {
      createdAt: nowIso(),
      result,
      taskId
    };
    this.lastDeliveryContext = stored;
    await this.evidenceStore.writeSnapshot(taskId, 'delivery-context/latest', stored);
    return stored;
  }

  async readDeliveryFromTask(taskId: string): Promise<StoredDeliveryContextSnapshot | null> {
    try {
      const snapshot = await this.evidenceStore.readSnapshot(taskId, 'delivery-context/latest');
      return isStoredDeliveryContextSnapshot(snapshot) ? snapshot : null;
    } catch {
      return null;
    }
  }
}
