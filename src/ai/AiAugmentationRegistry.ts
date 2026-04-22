import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { AiAugmentationResult, StoredAiAugmentationSnapshot } from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function isStoredAiAugmentationSnapshot(value: unknown): value is StoredAiAugmentationSnapshot {
  return Boolean(value && typeof value === 'object' && 'createdAt' in value && 'result' in value);
}

export class AiAugmentationRegistry {
  private lastResult: StoredAiAugmentationSnapshot | null = null;

  constructor(private readonly evidenceStore: EvidenceStore) {}

  setLast(result: AiAugmentationResult): void {
    this.lastResult = {
      createdAt: nowIso(),
      result
    };
  }

  getLast(): AiAugmentationResult | null {
    return this.lastResult?.result ?? null;
  }

  async storeToTask(taskId: string, result: AiAugmentationResult): Promise<StoredAiAugmentationSnapshot> {
    const stored: StoredAiAugmentationSnapshot = {
      createdAt: nowIso(),
      result,
      taskId
    };
    this.lastResult = stored;
    await this.evidenceStore.writeSnapshot(taskId, 'ai-augmentation/latest', stored);
    return stored;
  }

  async readFromTask(taskId: string): Promise<StoredAiAugmentationSnapshot | null> {
    try {
      const snapshot = await this.evidenceStore.readSnapshot(taskId, 'ai-augmentation/latest');
      return isStoredAiAugmentationSnapshot(snapshot) ? snapshot : null;
    } catch {
      return null;
    }
  }
}
