import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { ManagedBreakpoint, StoredBreakpointSnapshot } from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function isStoredBreakpointSnapshot(value: unknown): value is StoredBreakpointSnapshot {
  return Boolean(value && typeof value === 'object' && 'createdAt' in value && 'items' in value);
}

export class BreakpointRegistry {
  private items = new Map<string, ManagedBreakpoint>();

  constructor(private readonly evidenceStore: EvidenceStore) {}

  setItems(items: ManagedBreakpoint[]): void {
    this.items = new Map(items.map((item) => [item.breakpointId, item]));
  }

  getItems(): ManagedBreakpoint[] {
    return Array.from(this.items.values()).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  upsert(item: ManagedBreakpoint): void {
    this.items.set(item.breakpointId, item);
  }

  remove(breakpointId: string): void {
    this.items.delete(breakpointId);
  }

  async storeToTask(taskId: string, items: ManagedBreakpoint[]): Promise<StoredBreakpointSnapshot> {
    const snapshot: StoredBreakpointSnapshot = {
      createdAt: nowIso(),
      items,
      taskId
    };
    this.setItems(items);
    await this.evidenceStore.writeSnapshot(taskId, 'debugger/breakpoints', snapshot);
    await this.evidenceStore.writeSnapshot(taskId, 'debugger/breakpoints-latest', snapshot);
    return snapshot;
  }

  async readFromTask(taskId: string): Promise<StoredBreakpointSnapshot | null> {
    try {
      const snapshot = await this.evidenceStore.readSnapshot(taskId, 'debugger/breakpoints-latest');
      if (isStoredBreakpointSnapshot(snapshot)) {
        return snapshot;
      }
    } catch {
      return null;
    }

    return null;
  }
}
