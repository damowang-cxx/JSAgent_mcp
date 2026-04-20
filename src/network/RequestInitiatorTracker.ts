import type { Page } from 'puppeteer';

import { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import { AppError } from '../core/errors.js';
import type { RequestInitiatorRecord } from './types.js';

const PENDING_INITIATORS_KEY = 'JSAGENT_PENDING_INITIATORS';
const INITIATOR_HISTORY_KEY = 'JSAGENT_INITIATOR_HISTORY';
const XHR_WATCH_RULES_KEY = 'JSAGENT_XHR_WATCH_RULES';
const XHR_WATCH_EVENTS_KEY = 'JSAGENT_XHR_WATCH_EVENTS';
const MAX_INITIATOR_HISTORY = 500;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export class RequestInitiatorTracker {
  private readonly attachedCurrentDocuments = new Set<string>();
  private readonly attachedFutureDocuments = new Set<string>();
  private readonly trackedCloseListeners = new Set<string>();

  constructor(private readonly browserSession: BrowserSessionManager) {}

  async ensureAttachedToSelectedPage(): Promise<void> {
    const page = await this.browserSession.getSelectedPage();
    await this.ensureAttachedToPage(page);
  }

  async ensureAttachedToPage(page: Page): Promise<void> {
    const pageId = this.browserSession.getPageId(page);
    const script = this.getBootstrapScript();

    if (!this.attachedFutureDocuments.has(pageId)) {
      try {
        await page.evaluateOnNewDocument(script);
        this.attachedFutureDocuments.add(pageId);
      } catch (error) {
        throw new AppError('INITIATOR_TRACKER_ATTACH_FAILED', `Failed to attach initiator tracker for future documents: ${toErrorMessage(error)}`, {
          pageId
        });
      }
    }

    if (!this.attachedCurrentDocuments.has(pageId)) {
      try {
        await page.evaluate((source) => {
          (0, eval)(source);
        }, script);
        this.attachedCurrentDocuments.add(pageId);
      } catch (error) {
        throw new AppError('INITIATOR_TRACKER_ATTACH_FAILED', `Failed to attach initiator tracker to the current document: ${toErrorMessage(error)}`, {
          pageId
        });
      }
    }

    if (!this.trackedCloseListeners.has(pageId)) {
      page.once('close', () => {
        this.attachedCurrentDocuments.delete(pageId);
        this.attachedFutureDocuments.delete(pageId);
        this.trackedCloseListeners.delete(pageId);
      });
      this.trackedCloseListeners.add(pageId);
    }
  }

  async getInitiatorHistory(page: Page): Promise<RequestInitiatorRecord[]> {
    await this.ensureAttachedToPage(page);

    return page.evaluate(({ historyKey }) => {
      const root = window as unknown as Record<string, unknown>;
      const history = root[historyKey];
      if (!Array.isArray(history)) {
        return [];
      }

      return history as RequestInitiatorRecord[];
    }, {
      historyKey: INITIATOR_HISTORY_KEY
    });
  }

  private getBootstrapScript(): string {
    return `
(() => {
  const pendingKey = ${JSON.stringify(PENDING_INITIATORS_KEY)};
  const historyKey = ${JSON.stringify(INITIATOR_HISTORY_KEY)};
  const watchRulesKey = ${JSON.stringify(XHR_WATCH_RULES_KEY)};
  const watchEventsKey = ${JSON.stringify(XHR_WATCH_EVENTS_KEY)};
  const maxHistory = ${MAX_INITIATOR_HISTORY};

  const root = window;
  if (!root[pendingKey] || typeof root[pendingKey] !== 'object') {
    root[pendingKey] = {};
  }
  if (!Array.isArray(root[historyKey])) {
    root[historyKey] = [];
  }
  if (!Array.isArray(root[watchRulesKey])) {
    root[watchRulesKey] = [];
  }
  if (!Array.isArray(root[watchEventsKey])) {
    root[watchEventsKey] = [];
  }

  if (root.__jsagentInitiatorTrackerInstalled) {
    return;
  }

  root.__jsagentInitiatorTrackerInstalled = true;

  function nextId(prefix) {
    return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  }

  function safeSerialize(value, depth = 0) {
    if (value === null || value === undefined) {
      return value;
    }

    if (depth > 2) {
      return '[MaxDepth]';
    }

    const valueType = typeof value;
    if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
      return value;
    }

    if (valueType === 'function') {
      return '[Function]';
    }

    if (value instanceof Error) {
      return {
        message: value.message,
        name: value.name,
        stack: value.stack
      };
    }

    if (Array.isArray(value)) {
      return value.slice(0, 20).map((item) => safeSerialize(item, depth + 1));
    }

    if (typeof URL !== 'undefined' && value instanceof URL) {
      return value.toString();
    }

    if (typeof Request !== 'undefined' && value instanceof Request) {
      return {
        method: value.method,
        url: value.url
      };
    }

    if (typeof Headers !== 'undefined' && value instanceof Headers) {
      const headers = {};
      value.forEach((headerValue, headerName) => {
        headers[headerName] = headerValue;
      });
      return headers;
    }

    if (valueType === 'object') {
      const output = {};
      const entries = Object.entries(value).slice(0, 20);
      for (const [key, entryValue] of entries) {
        output[key] = safeSerialize(entryValue, depth + 1);
      }
      return output;
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return String(value);
    }
  }

  function captureStack() {
    try {
      throw new Error('JSAGENT_INITIATOR_STACK');
    } catch (error) {
      return error && error.stack ? String(error.stack) : undefined;
    }
  }

  function pushInitiatorRecord(record) {
    const pending = root[pendingKey];
    const history = root[historyKey];

    pending[record.initiatorId] = record;
    history.push(record);

    if (history.length > maxHistory) {
      const removed = history.splice(0, history.length - maxHistory);
      for (const item of removed) {
        if (item && item.initiatorId) {
          delete pending[item.initiatorId];
        }
      }
    }
  }

  function getRules() {
    return Array.isArray(root[watchRulesKey]) ? root[watchRulesKey] : [];
  }

  function getEvents() {
    if (!Array.isArray(root[watchEventsKey])) {
      root[watchEventsKey] = [];
    }

    return root[watchEventsKey];
  }

  function matchesWatchRule(rule, record) {
    if (!rule || rule.enabled === false || typeof rule.pattern !== 'string') {
      return false;
    }

    if (Array.isArray(rule.methods) && rule.methods.length > 0) {
      const normalizedMethods = rule.methods
        .filter((method) => typeof method === 'string')
        .map((method) => method.toUpperCase());
      if (normalizedMethods.length > 0 && !normalizedMethods.includes(String(record.method || '').toUpperCase())) {
        return false;
      }
    }

    const url = String(record.url || '');
    if (rule.isRegex) {
      try {
        return new RegExp(rule.pattern, 'i').test(url);
      } catch {
        return false;
      }
    }

    return url.includes(rule.pattern);
  }

  function evaluateWatchRules(record) {
    const events = getEvents();

    for (const rule of getRules()) {
      if (!matchesWatchRule(rule, record)) {
        continue;
      }

      events.push({
        eventId: nextId('xhr-watch'),
        initiatorId: record.initiatorId,
        matchedAt: new Date().toISOString(),
        method: record.method,
        mode: rule.mode || 'record',
        pageUrl: record.pageUrl,
        pattern: rule.pattern,
        ruleId: rule.id,
        type: record.type,
        url: record.url
      });

      if (events.length > maxHistory) {
        events.splice(0, events.length - maxHistory);
      }

      if (rule.mode === 'debugger-statement') {
        debugger;
      }
    }
  }

  if (typeof window.fetch === 'function' && !window.fetch.__jsagentInitiatorWrapped) {
    const originalFetch = window.fetch;
    const wrappedFetch = function(...args) {
      const requestInput = args[0];
      const requestInit = args[1];
      const bodySummary = requestInit && typeof requestInit === 'object' && 'body' in requestInit
        ? requestInit.body
        : undefined;
      const record = {
        bodySummary: safeSerialize(bodySummary),
        initiatorId: nextId('fetch'),
        inputSummary: safeSerialize({
          init: requestInit,
          input: requestInput
        }),
        method: requestInit && typeof requestInit.method === 'string'
          ? requestInit.method
          : requestInput && typeof requestInput.method === 'string'
            ? requestInput.method
            : 'GET',
        pageUrl: String(location.href),
        stack: captureStack(),
        timestamp: new Date().toISOString(),
        type: 'fetch',
        url: typeof requestInput === 'string'
          ? requestInput
          : requestInput && typeof requestInput.url === 'string'
            ? requestInput.url
            : String(requestInput)
      };

      pushInitiatorRecord(record);
      evaluateWatchRules(record);
      return originalFetch.apply(this, args);
    };

    Object.defineProperty(wrappedFetch, '__jsagentInitiatorWrapped', {
      configurable: true,
      enumerable: false,
      value: true
    });

    window.fetch = wrappedFetch;
  }

  const xhrPrototype = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
  if (
    xhrPrototype &&
    typeof xhrPrototype.open === 'function' &&
    typeof xhrPrototype.send === 'function' &&
    !xhrPrototype.open.__jsagentInitiatorWrapped &&
    !xhrPrototype.send.__jsagentInitiatorWrapped
  ) {
    const originalOpen = xhrPrototype.open;
    const originalSend = xhrPrototype.send;

    xhrPrototype.open = function(method, url, ...rest) {
      this.__jsagentInitiatorState = {
        method: typeof method === 'string' ? method : String(method),
        pageUrl: String(location.href),
        stack: captureStack(),
        timestamp: new Date().toISOString(),
        url: typeof url === 'string' ? url : String(url)
      };

      return originalOpen.call(this, method, url, ...rest);
    };

    Object.defineProperty(xhrPrototype.open, '__jsagentInitiatorWrapped', {
      configurable: true,
      enumerable: false,
      value: true
    });

    xhrPrototype.send = function(body) {
      const state = this.__jsagentInitiatorState && typeof this.__jsagentInitiatorState === 'object'
        ? this.__jsagentInitiatorState
        : {
            method: 'GET',
            pageUrl: String(location.href),
            stack: captureStack(),
            timestamp: new Date().toISOString(),
            url: ''
          };

      const record = {
        bodySummary: safeSerialize(body),
        initiatorId: nextId('xhr'),
        method: state.method,
        pageUrl: state.pageUrl,
        stack: state.stack,
        timestamp: state.timestamp,
        type: 'xhr',
        url: state.url
      };

      pushInitiatorRecord(record);
      evaluateWatchRules(record);
      return originalSend.call(this, body);
    };

    Object.defineProperty(xhrPrototype.send, '__jsagentInitiatorWrapped', {
      configurable: true,
      enumerable: false,
      value: true
    });
  }
})();
`.trim();
  }
}
