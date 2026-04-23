import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { TaskManifestManager } from '../task/TaskManifestManager.js';
import type { FunctionScalpelSnapshot } from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function isFunctionScalpelSnapshot(value: unknown): value is FunctionScalpelSnapshot {
  return Boolean(value && typeof value === 'object');
}

export class FunctionScalpelRegistry {
  private lastSnapshot: FunctionScalpelSnapshot | null = null;

  constructor(private readonly deps: {
    evidenceStore: EvidenceStore;
    taskManifestManager: TaskManifestManager;
  }) {}

  setLast(snapshot: FunctionScalpelSnapshot): void {
    this.lastSnapshot = mergeSnapshots(this.lastSnapshot, snapshot);
  }

  getLast(): FunctionScalpelSnapshot | null {
    return this.lastSnapshot ? cloneSnapshot(this.lastSnapshot) : null;
  }

  async storeToTask(taskId: string, snapshot: FunctionScalpelSnapshot): Promise<void> {
    await this.deps.evidenceStore.openTask({ taskId });
    const existing = await this.readFromTask(taskId);
    const merged = mergeSnapshots(existing ?? this.lastSnapshot, snapshot);
    this.lastSnapshot = merged;
    await this.deps.evidenceStore.writeSnapshot(taskId, 'function-scalpel/latest', merged);
    await this.deps.taskManifestManager.ensureTask(taskId);
    await this.deps.taskManifestManager.updatePointers(taskId, {
      functionScalpel: 'function-scalpel/latest'
    });
  }

  async readFromTask(taskId: string): Promise<FunctionScalpelSnapshot | null> {
    try {
      const snapshot = await this.deps.evidenceStore.readSnapshot(taskId, 'function-scalpel/latest');
      return isFunctionScalpelSnapshot(snapshot) ? cloneSnapshot(snapshot) : null;
    } catch {
      return null;
    }
  }
}

function mergeSnapshots(current: FunctionScalpelSnapshot | null, patch: FunctionScalpelSnapshot): FunctionScalpelSnapshot {
  return {
    ...(current ?? {}),
    ...patch,
    createdAt: nowIso(),
    events: patch.events ? patch.events.map((item) => ({ ...item, payloadPreview: item.payloadPreview ? { ...item.payloadPreview } : undefined })) : current?.events,
    hooks: patch.hooks ? patch.hooks.map((item) => ({ ...item, options: item.options ? { ...item.options } : undefined })) : current?.hooks,
    inspections: patch.inspections ? patch.inspections.map((item) => ({
      ...item,
      properties: item.properties.map((property) => ({ ...property })),
      prototypeChain: item.prototypeChain ? [...item.prototypeChain] : undefined
    })) : current?.inspections,
    monitors: patch.monitors ? patch.monitors.map((item) => ({ ...item })) : current?.monitors,
    notes: [
      ...(current?.notes ?? []),
      ...(patch.notes ?? [])
    ].slice(-80),
    traces: patch.traces ? patch.traces.map((item) => ({
      ...item,
      argsPreview: item.argsPreview ? [...item.argsPreview] : undefined,
      stackPreview: item.stackPreview ? [...item.stackPreview] : undefined
    })) : current?.traces
  };
}

function cloneSnapshot(snapshot: FunctionScalpelSnapshot): FunctionScalpelSnapshot {
  return {
    ...snapshot,
    events: snapshot.events?.map((item) => ({ ...item, payloadPreview: item.payloadPreview ? { ...item.payloadPreview } : undefined })),
    hooks: snapshot.hooks?.map((item) => ({ ...item, options: item.options ? { ...item.options } : undefined })),
    inspections: snapshot.inspections?.map((item) => ({
      ...item,
      properties: item.properties.map((property) => ({ ...property })),
      prototypeChain: item.prototypeChain ? [...item.prototypeChain] : undefined
    })),
    monitors: snapshot.monitors?.map((item) => ({ ...item })),
    notes: snapshot.notes ? [...snapshot.notes] : undefined,
    traces: snapshot.traces?.map((item) => ({
      ...item,
      argsPreview: item.argsPreview ? [...item.argsPreview] : undefined,
      stackPreview: item.stackPreview ? [...item.stackPreview] : undefined
    }))
  };
}
