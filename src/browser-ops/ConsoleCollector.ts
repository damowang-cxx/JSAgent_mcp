import type { ConsoleMessage, Page } from 'puppeteer';

import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import type { ConsoleMessageSummary, ConsoleMessageType } from './types.js';

const MAX_MESSAGES = 500;
const MAX_TEXT_LENGTH = 2_000;

export class ConsoleCollector {
  private currentPage: Page | null = null;
  private currentPageId: string | null = null;
  private handler: ((message: ConsoleMessage) => void) | null = null;
  private messages: ConsoleMessageSummary[] = [];
  private sequence = 0;

  constructor(private readonly browserSession: BrowserSessionManager) {}

  async ensureAttached(): Promise<void> {
    const page = await this.browserSession.getSelectedPage();
    const pageId = this.browserSession.getPageId(page);
    if (this.currentPageId === pageId && this.handler) {
      return;
    }

    this.clearForPageChange();
    this.currentPage = page;
    this.currentPageId = pageId;
    this.handler = (message) => {
      this.messages.push(this.toSummary(message));
      if (this.messages.length > MAX_MESSAGES) {
        this.messages = this.messages.slice(this.messages.length - MAX_MESSAGES);
      }
    };
    page.on('console', this.handler);
  }

  listMessages(options: {
    pageSize?: number;
    pageIdx?: number;
    types?: string[];
  } = {}): ConsoleMessageSummary[] {
    const pageSize = Math.min(Math.max(options.pageSize ?? 50, 1), 200);
    const pageIdx = Math.max(options.pageIdx ?? 0, 0);
    const typeFilter = new Set((options.types ?? []).map((type) => normalizeType(type)));
    const filtered = typeFilter.size > 0
      ? this.messages.filter((message) => typeFilter.has(message.type))
      : this.messages;
    return filtered.slice(pageIdx * pageSize, pageIdx * pageSize + pageSize);
  }

  getMessage(id: string): ConsoleMessageSummary | null {
    return this.messages.find((message) => message.id === id) ?? null;
  }

  clearForPageChange(): void {
    if (this.currentPage && this.handler) {
      this.currentPage.off('console', this.handler);
    }
    this.currentPage = null;
    this.currentPageId = null;
    this.handler = null;
    this.messages = [];
  }

  private toSummary(message: ConsoleMessage): ConsoleMessageSummary {
    const location = message.location();
    return {
      id: `console-${Date.now().toString(36)}-${++this.sequence}`,
      text: message.text().slice(0, MAX_TEXT_LENGTH),
      timestamp: new Date().toISOString(),
      type: normalizeType(message.type()),
      ...(location.url ? { url: location.url } : {})
    };
  }
}

function normalizeType(type: string): ConsoleMessageType {
  switch (type) {
    case 'log':
    case 'error':
    case 'info':
    case 'debug':
    case 'trace':
      return type;
    case 'warn':
    case 'warning':
      return 'warning';
    default:
      return 'unknown';
  }
}
