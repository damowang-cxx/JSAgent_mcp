import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { FlowReasoningResult, StoredFlowReasoningSnapshot } from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function isStoredFlowReasoningSnapshot(value: unknown): value is StoredFlowReasoningSnapshot {
  return Boolean(value && typeof value === 'object' && 'createdAt' in value && 'result' in value);
}

export class FlowReasoningRegistry {
  private lastResult: StoredFlowReasoningSnapshot | null = null;

  constructor(private readonly evidenceStore: EvidenceStore) {}

  setLast(result: FlowReasoningResult): void {
    this.lastResult = {
      createdAt: nowIso(),
      result
    };
  }

  getLast(): FlowReasoningResult | null {
    return this.lastResult?.result ?? null;
  }

  async storeToTask(taskId: string, result: FlowReasoningResult): Promise<StoredFlowReasoningSnapshot> {
    const stored: StoredFlowReasoningSnapshot = {
      createdAt: nowIso(),
      result,
      taskId
    };
    this.lastResult = stored;
    await this.evidenceStore.writeSnapshot(taskId, 'flow-reasoning/latest', stored);
    return stored;
  }

  async readFromTask(taskId: string): Promise<StoredFlowReasoningSnapshot | null> {
    try {
      const snapshot = await this.evidenceStore.readSnapshot(taskId, 'flow-reasoning/latest');
      return isStoredFlowReasoningSnapshot(snapshot) ? snapshot : null;
    } catch {
      return null;
    }
  }
}
