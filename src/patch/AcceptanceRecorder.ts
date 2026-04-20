import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { AcceptanceRecord, AcceptanceStatus } from './types.js';

export class AcceptanceRecorder {
  private readonly records = new Map<string, AcceptanceRecord[]>();

  constructor(private readonly evidenceStore: EvidenceStore) {}

  async record(options: {
    taskId: string;
    status: AcceptanceStatus;
    targetUrl?: string;
    evidence?: Record<string, unknown>;
    notes?: string[];
  }): Promise<AcceptanceRecord> {
    const acceptance: AcceptanceRecord = {
      evidence: options.evidence,
      notes: options.notes,
      recordedAt: new Date().toISOString(),
      status: options.status,
      targetUrl: options.targetUrl,
      taskId: options.taskId
    };

    const existing = this.records.get(options.taskId) ?? [];
    existing.push(acceptance);
    this.records.set(options.taskId, existing);

    await this.evidenceStore.openTask({
      taskId: options.taskId,
      targetUrl: options.targetUrl
    });
    await this.evidenceStore.appendLog(options.taskId, 'acceptance', {
      kind: 'patch_acceptance',
      acceptance
    });
    await this.evidenceStore.writeSnapshot(options.taskId, 'latest-acceptance', acceptance);

    return acceptance;
  }

  async list(taskId: string): Promise<AcceptanceRecord[]> {
    return [...(this.records.get(taskId) ?? [])];
  }

  async latest(taskId: string): Promise<AcceptanceRecord | null> {
    const records = await this.list(taskId);
    return records.at(-1) ?? null;
  }
}
