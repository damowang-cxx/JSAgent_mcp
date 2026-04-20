import type { Page } from 'puppeteer';

import { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import { AppError } from '../core/errors.js';
import { RequestInitiatorTracker } from './RequestInitiatorTracker.js';
import type { XhrWatchMode, XhrWatchRule } from './types.js';

const XHR_WATCH_RULES_KEY = 'JSAGENT_XHR_WATCH_RULES';
const XHR_WATCH_EVENTS_KEY = 'JSAGENT_XHR_WATCH_EVENTS';

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export class XhrWatchpointManager {
  private readonly rules = new Map<string, XhrWatchRule>();
  private readonly futureRuleHashes = new Map<string, string>();

  constructor(
    private readonly browserSession: BrowserSessionManager,
    private readonly requestInitiatorTracker: RequestInitiatorTracker
  ) {}

  addRule(input: {
    url: string;
    isRegex?: boolean;
    methods?: string[];
    mode?: XhrWatchMode;
  }): XhrWatchRule {
    const pattern = input.url.trim();
    if (pattern.length === 0) {
      throw new AppError('WATCHPOINT_URL_REQUIRED', 'break_on_xhr requires a non-empty url or pattern.');
    }

    if (input.isRegex) {
      try {
        new RegExp(pattern, 'i');
      } catch (error) {
        throw new AppError('INVALID_REGEX', `Invalid regular expression: ${error instanceof Error ? error.message : String(error)}`, {
          pattern
        });
      }
    }

    const methods = input.methods
      ?.map((method) => method.trim().toUpperCase())
      .filter((method) => method.length > 0);

    const rule: XhrWatchRule = {
      createdAt: new Date().toISOString(),
      enabled: true,
      id: `xhr-watch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...(input.isRegex ? { isRegex: true } : {}),
      ...(methods && methods.length > 0 ? { methods } : {}),
      mode: input.mode ?? 'record',
      pattern
    };

    this.rules.set(rule.id, rule);
    return rule;
  }

  listRules(): XhrWatchRule[] {
    return Array.from(this.rules.values()).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  removeRule(filter: { ruleId?: string; url?: string }): { removed: boolean; removedCount: number } {
    if (filter.ruleId) {
      const removed = this.rules.delete(filter.ruleId);
      return {
        removed,
        removedCount: removed ? 1 : 0
      };
    }

    if (filter.url) {
      let removedCount = 0;
      for (const [ruleId, rule] of this.rules.entries()) {
        if (rule.pattern === filter.url) {
          this.rules.delete(ruleId);
          removedCount += 1;
        }
      }

      return {
        removed: removedCount > 0,
        removedCount
      };
    }

    throw new AppError('WATCHPOINT_FILTER_REQUIRED', 'remove_xhr_breakpoint requires ruleId or url.');
  }

  clearRules(): void {
    this.rules.clear();
    this.futureRuleHashes.clear();
  }

  async ensureInjectedToSelectedPage(): Promise<void> {
    const page = await this.browserSession.getSelectedPage();
    await this.ensureInjectedToPage(page);
  }

  private async ensureInjectedToPage(page: Page): Promise<void> {
    const pageId = this.browserSession.getPageId(page);
    const payload = this.buildRulePayload();
    const payloadHash = JSON.stringify(payload.rules);

    await this.requestInitiatorTracker.ensureAttachedToPage(page);

    try {
      await page.evaluate((currentPayload) => {
        const root = window as unknown as Record<string, unknown>;
        root[currentPayload.eventsKey] = Array.isArray(root[currentPayload.eventsKey]) ? root[currentPayload.eventsKey] : [];
        root[currentPayload.rulesKey] = currentPayload.rules;
      }, payload);
    } catch (error) {
      throw new AppError('WATCHPOINT_INJECTION_FAILED', `Failed to update XHR watchpoints on the current document: ${toErrorMessage(error)}`, {
        pageId
      });
    }

    if (this.futureRuleHashes.get(pageId) === payloadHash) {
      return;
    }

    try {
      await page.evaluateOnNewDocument((futurePayload) => {
        const root = window as unknown as Record<string, unknown>;
        root[futurePayload.eventsKey] = Array.isArray(root[futurePayload.eventsKey]) ? root[futurePayload.eventsKey] : [];
        root[futurePayload.rulesKey] = futurePayload.rules;
      }, payload);
      this.futureRuleHashes.set(pageId, payloadHash);
    } catch (error) {
      throw new AppError('WATCHPOINT_INJECTION_FAILED', `Failed to seed XHR watchpoints for future documents: ${toErrorMessage(error)}`, {
        pageId
      });
    }

    page.once('close', () => {
      this.futureRuleHashes.delete(pageId);
    });
  }

  private buildRulePayload(): {
    eventsKey: string;
    rules: XhrWatchRule[];
    rulesKey: string;
  } {
    return {
      eventsKey: XHR_WATCH_EVENTS_KEY,
      rules: this.listRules().map((rule) => ({ ...rule })),
      rulesKey: XHR_WATCH_RULES_KEY
    };
  }
}
