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
    const evidenceRecords = await this.loadFromEvidence(taskId);
    const merged = new Map<string, AcceptanceRecord>();
    for (const record of [...evidenceRecords, ...(this.records.get(taskId) ?? [])]) {
      merged.set(`${record.recordedAt}:${record.status}:${record.targetUrl ?? ''}`, record);
    }

    const records = Array.from(merged.values()).sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
    this.records.set(taskId, records);
    return records;
  }

  async latest(taskId: string): Promise<AcceptanceRecord | null> {
    const snapshot = await this.loadLatestSnapshot(taskId);
    if (snapshot) {
      const existing = this.records.get(taskId) ?? [];
      this.records.set(taskId, [...existing, snapshot]);
    }
    const records = await this.list(taskId);
    return records.at(-1) ?? null;
  }

  private async loadFromEvidence(taskId: string): Promise<AcceptanceRecord[]> {
    try {
      const records = await this.evidenceStore.readLog(taskId, 'acceptance');
      return records
        .filter((record) => record.kind === 'patch_acceptance' && isRecord(record.acceptance))
        .map((record) => record.acceptance as unknown as AcceptanceRecord)
        .filter((record) => typeof record.taskId === 'string' && typeof record.recordedAt === 'string');
    } catch {
      return [];
    }
  }

  private async loadLatestSnapshot(taskId: string): Promise<AcceptanceRecord | null> {
    try {
      const snapshot = await this.evidenceStore.readSnapshot(taskId, 'latest-acceptance');
      if (isRecord(snapshot) && typeof snapshot.taskId === 'string' && typeof snapshot.recordedAt === 'string') {
        return snapshot as unknown as AcceptanceRecord;
      }
      return null;
    } catch {
      return null;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
