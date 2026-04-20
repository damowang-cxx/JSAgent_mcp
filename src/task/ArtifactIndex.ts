import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { ArtifactPointer } from './types.js';

export class ArtifactIndex {
  constructor(private readonly evidenceStore: EvidenceStore) {}

  async build(taskId: string): Promise<ArtifactPointer[]> {
    const createdAt = new Date().toISOString();
    const [snapshots, logs] = await Promise.all([
      this.evidenceStore.listSnapshots(taskId),
      this.evidenceStore.listLogs(taskId)
    ]);

    return [
      ...snapshots.map((snapshotName) => ({
        createdAt,
        kind: 'snapshot',
        snapshotName,
        summary: snapshotName
      })),
      ...logs.map((logName) => ({
        createdAt,
        kind: 'log',
        logName,
        summary: logName
      }))
    ];
  }
}
