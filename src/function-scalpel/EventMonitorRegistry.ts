import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import { AppError } from '../core/errors.js';
import type { EventMonitorRecord, EventOccurrence } from './types.js';

const STORE_KEY = '__JSAGENT_EVENT_SCALPEL__';
const MAX_PAGE_EVENTS = 700;
const DEFAULT_LIST_LIMIT = 100;

export class EventMonitorRegistry {
  private counter = 0;
  private readonly monitors = new Map<string, EventMonitorRecord>();
  private readonly events: EventOccurrence[] = [];
  private readonly seen = new Set<string>();

  constructor(private readonly deps: { browserSession: BrowserSessionManager }) {}

  async add(options: {
    eventType: string;
    target?: 'document' | 'window' | 'selector';
    selector?: string;
  }): Promise<EventMonitorRecord> {
    const eventType = options.eventType.trim();
    if (!eventType) {
      throw new AppError('EVENT_TYPE_REQUIRED', 'monitor_events requires a non-empty eventType.');
    }
    const target = options.target ?? 'document';
    if (target === 'selector' && !options.selector?.trim()) {
      throw new AppError('EVENT_SELECTOR_REQUIRED', 'monitor_events target=selector requires selector.');
    }

    const item: EventMonitorRecord = {
      createdAt: new Date().toISOString(),
      enabled: true,
      eventType,
      monitorId: `event-scalpel-${++this.counter}`,
      target,
      ...(options.selector?.trim() ? { selector: options.selector.trim() } : {})
    };

    const page = await this.deps.browserSession.getSelectedPage();
    const result = await page.evaluate(installEventMonitor, {
      maxRecords: MAX_PAGE_EVENTS,
      monitor: item,
      storeKey: STORE_KEY
    });
    if (!result.ok) {
      throw new AppError('EVENT_MONITOR_FAILED', result.error ?? 'Failed to install event monitor.', {
        monitorId: item.monitorId
      });
    }

    this.monitors.set(item.monitorId, item);
    return { ...item };
  }

  listMonitors(): EventMonitorRecord[] {
    return Array.from(this.monitors.values())
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((item) => ({ ...item }));
  }

  async removeMonitor(monitorId: string): Promise<boolean> {
    const existed = this.monitors.has(monitorId);
    const page = await this.deps.browserSession.getSelectedPage();
    let removedFromPage = false;
    try {
      const result = await page.evaluate(removeEventMonitor, {
        monitorId,
        storeKey: STORE_KEY
      });
      removedFromPage = result.removed;
    } catch {
      removedFromPage = false;
    }
    this.monitors.delete(monitorId);
    return existed || removedFromPage;
  }

  async listEvents(options: { monitorId?: string; limit?: number } = {}): Promise<EventOccurrence[]> {
    await this.collectPageEvents();
    const limit = Math.max(1, Math.min(500, Math.floor(options.limit ?? DEFAULT_LIST_LIMIT)));
    return this.events
      .filter((item) => !options.monitorId || item.monitorId === options.monitorId)
      .slice(-limit)
      .map((item) => ({ ...item, payloadPreview: item.payloadPreview ? { ...item.payloadPreview } : undefined }));
  }

  async clearEvents(options: { monitorId?: string } = {}): Promise<void> {
    if (!options.monitorId) {
      this.events.length = 0;
      this.seen.clear();
    } else {
      for (let index = this.events.length - 1; index >= 0; index -= 1) {
        if (this.events[index]?.monitorId === options.monitorId) {
          this.seen.delete(eventKey(this.events[index]));
          this.events.splice(index, 1);
        }
      }
    }

    const page = await this.deps.browserSession.getSelectedPage();
    await page.evaluate(({ monitorId, storeKey }) => {
      const root = window as unknown as Record<string, unknown>;
      const store = root[storeKey] as { events?: EventOccurrence[] } | undefined;
      if (!store || !Array.isArray(store.events)) {
        return;
      }
      if (!monitorId) {
        store.events = [];
        return;
      }
      store.events = store.events.filter((item) => item.monitorId !== monitorId);
    }, {
      monitorId: options.monitorId,
      storeKey: STORE_KEY
    });
  }

  private async collectPageEvents(): Promise<void> {
    const page = await this.deps.browserSession.getSelectedPage();
    let records: EventOccurrence[] = [];
    try {
      records = await page.evaluate(({ storeKey }) => {
        const root = window as unknown as Record<string, unknown>;
        const store = root[storeKey] as { events?: EventOccurrence[] } | undefined;
        return Array.isArray(store?.events) ? store.events : [];
      }, {
        storeKey: STORE_KEY
      });
    } catch {
      records = [];
    }

    for (const record of records) {
      const key = eventKey(record);
      if (this.seen.has(key)) {
        continue;
      }
      this.events.push({ ...record, payloadPreview: record.payloadPreview ? { ...record.payloadPreview } : undefined });
      this.seen.add(key);
    }

    while (this.events.length > MAX_PAGE_EVENTS) {
      const removed = this.events.shift();
      if (removed) {
        this.seen.delete(eventKey(removed));
      }
    }
  }
}

type PageEventStore = {
  monitors: Record<string, EventMonitorRecord>;
  listeners: Record<string, EventListener>;
  events: EventOccurrence[];
};

function installEventMonitor(input: {
  monitor: EventMonitorRecord;
  maxRecords: number;
  storeKey: string;
}): {
  ok: boolean;
  error?: string;
} {
  const root = window as unknown as Record<string, unknown>;
  const store = ensureEventStore(root, input.storeKey);
  let target: EventTarget | null = null;
  if (input.monitor.target === 'window') {
    target = window;
  } else if (input.monitor.target === 'document') {
    target = document;
  } else {
    target = document.querySelector(input.monitor.selector ?? '');
  }
  if (!target) {
    return {
      error: 'Event monitor target not found.',
      ok: false
    };
  }

  const handler = (event: Event) => {
    const occurrence: EventOccurrence = {
      eventType: input.monitor.eventType,
      firedAt: new Date().toISOString(),
      monitorId: input.monitor.monitorId,
      occurrenceId: `${input.monitor.monitorId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      payloadPreview: eventPayload(event),
      targetSummary: targetSummary(event.target)
    };
    store.events.push(occurrence);
    if (store.events.length > input.maxRecords) {
      store.events.splice(0, store.events.length - input.maxRecords);
    }
  };

  target.addEventListener(input.monitor.eventType, handler, true);
  store.monitors[input.monitor.monitorId] = input.monitor;
  store.listeners[input.monitor.monitorId] = handler;
  return { ok: true };
}

function removeEventMonitor(input: { monitorId: string; storeKey: string }): { removed: boolean } {
  const root = window as unknown as Record<string, unknown>;
  const store = root[input.storeKey] as PageEventStore | undefined;
  if (!store?.monitors[input.monitorId]) {
    return { removed: false };
  }
  const monitor = store.monitors[input.monitorId];
  const handler = store.listeners[input.monitorId];
  let target: EventTarget | null = null;
  if (monitor.target === 'window') {
    target = window;
  } else if (monitor.target === 'document') {
    target = document;
  } else {
    target = document.querySelector(monitor.selector ?? '');
  }
  if (target && handler) {
    target.removeEventListener(monitor.eventType, handler, true);
  }
  delete store.monitors[input.monitorId];
  delete store.listeners[input.monitorId];
  return { removed: true };
}

function ensureEventStore(root: Record<string, unknown>, storeKey: string): PageEventStore {
  if (!root[storeKey] || typeof root[storeKey] !== 'object') {
    root[storeKey] = {
      events: [],
      listeners: {},
      monitors: {}
    };
  }
  const store = root[storeKey] as Partial<PageEventStore>;
  store.events ??= [];
  store.listeners ??= {};
  store.monitors ??= {};
  return store as PageEventStore;
}

function eventPayload(event: Event): Record<string, unknown> {
  const keyboard = event as KeyboardEvent;
  const mouse = event as MouseEvent;
  const input = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  return {
    type: event.type,
    ...(typeof keyboard.key === 'string' && keyboard.key ? { key: keyboard.key } : {}),
    ...(typeof keyboard.code === 'string' && keyboard.code ? { code: keyboard.code } : {}),
    ...(typeof mouse.button === 'number' ? { button: mouse.button } : {}),
    ...(typeof mouse.clientX === 'number' ? { clientX: mouse.clientX, clientY: mouse.clientY } : {}),
    ...(input && 'value' in input ? { valuePreview: String(input.value).slice(0, 200) } : {})
  };
}

function targetSummary(target: EventTarget | null): string {
  if (!(target instanceof Element)) {
    return target ? String(target) : '(unknown)';
  }
  const tag = target.tagName.toLowerCase();
  const id = target.id ? `#${target.id}` : '';
  const className = typeof target.className === 'string' && target.className
    ? `.${target.className.trim().split(/\s+/).slice(0, 4).join('.')}`
    : '';
  return `${tag}${id}${className}`;
}

function eventKey(record: EventOccurrence): string {
  return record.occurrenceId ?? `${record.monitorId}|${record.eventType}|${record.firedAt}|${record.targetSummary ?? ''}`;
}
