import type { FunctionTraceRecord } from './types.js';

const DEFAULT_MAX_RECORDS = 700;
const DEFAULT_LIST_LIMIT = 100;

export class FunctionTraceRegistry {
  private readonly items: FunctionTraceRecord[] = [];
  private readonly seen = new Set<string>();

  constructor(private readonly maxRecords = DEFAULT_MAX_RECORDS) {}

  append(record: FunctionTraceRecord): void {
    const key = traceKey(record);
    if (this.seen.has(key)) {
      return;
    }

    this.items.push({ ...record });
    this.seen.add(key);
    this.trim();
  }

  appendMany(records: readonly FunctionTraceRecord[]): void {
    for (const record of records) {
      this.append(record);
    }
  }

  list(options: { hookId?: string; limit?: number } = {}): FunctionTraceRecord[] {
    const limit = Math.max(1, Math.min(500, Math.floor(options.limit ?? DEFAULT_LIST_LIMIT)));
    return this.items
      .filter((item) => !options.hookId || item.hookId === options.hookId)
      .slice(-limit)
      .map((item) => cloneTrace(item));
  }

  clear(options: { hookId?: string } = {}): void {
    if (!options.hookId) {
      this.items.length = 0;
      this.seen.clear();
      return;
    }

    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      if (this.items[index]?.hookId === options.hookId) {
        this.seen.delete(traceKey(this.items[index]));
        this.items.splice(index, 1);
      }
    }
  }

  private trim(): void {
    while (this.items.length > this.maxRecords) {
      const removed = this.items.shift();
      if (removed) {
        this.seen.delete(traceKey(removed));
      }
    }
  }
}

function traceKey(record: FunctionTraceRecord): string {
  return record.traceId ?? [
    record.hookId,
    record.calledAt,
    record.error ?? '',
    JSON.stringify(record.argsPreview ?? null),
    JSON.stringify(record.resultPreview ?? null)
  ].join('|');
}

function cloneTrace(record: FunctionTraceRecord): FunctionTraceRecord {
  return {
    ...record,
    argsPreview: record.argsPreview ? [...record.argsPreview] : undefined,
    stackPreview: record.stackPreview ? [...record.stackPreview] : undefined
  };
}
