import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import { AppError } from '../core/errors.js';
import type { PageController } from '../page/PageController.js';
import type { ReplayAction, ReplayStepResult } from './types.js';
import type { WaitConditionEvaluator } from './WaitConditionEvaluator.js';

function nowIso(): string {
  return new Date().toISOString();
}

function summarizeValue(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 500 ? `${serialized.slice(0, 500)}...[truncated]` : JSON.parse(serialized) as unknown;
  } catch {
    return String(value);
  }
}

export class ReplayActionRunner {
  constructor(
    private readonly deps: {
      browserSession: BrowserSessionManager;
      pageController: PageController;
      waitConditionEvaluator: WaitConditionEvaluator;
    }
  ) {}

  async run(action: ReplayAction): Promise<ReplayStepResult> {
    const startedAt = nowIso();

    try {
      const details = await this.runInternal(action, startedAt);
      const finishedAt = nowIso();
      return {
        action,
        details,
        finishedAt,
        ok: true,
        startedAt,
        summary: this.successSummary(action, details)
      };
    } catch (error) {
      const finishedAt = nowIso();
      return {
        action,
        details: {
          error: error instanceof Error ? error.message : String(error)
        },
        finishedAt,
        ok: false,
        startedAt,
        summary: `Failed ${action.type}: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async runInternal(action: ReplayAction, startedAt: string): Promise<Record<string, unknown>> {
    switch (action.type) {
      case 'click':
        this.require(action.selector, 'selector', action.type);
        return await this.deps.pageController.click(action.selector!);
      case 'input':
        this.require(action.selector, 'selector', action.type);
        this.require(action.value, 'value', action.type);
        await this.clearInput(action.selector!);
        return await this.deps.pageController.type(action.selector!, action.value!);
      case 'submit':
        this.require(action.selector, 'selector', action.type);
        return await this.submit(action.selector!);
      case 'evaluate':
        this.require(action.expression, 'expression', action.type);
        return {
          result: summarizeValue(await this.deps.pageController.evaluate(action.expression!))
        };
      case 'navigate':
        this.require(action.url, 'url', action.type);
        return await this.deps.browserSession.navigateSelectedPage({
          timeout: action.timeoutMs,
          type: 'url',
          url: action.url
        });
      case 'wait-for-selector':
        this.require(action.selector, 'selector', action.type);
        return await this.deps.waitConditionEvaluator.waitForSelector(action.selector!, action.timeoutMs);
      case 'wait-for-request': {
        const result = await this.deps.waitConditionEvaluator.waitForRequest({
          method: action.method,
          startedAfter: startedAt,
          timeoutMs: action.timeoutMs,
          url: action.url
        });
        if (!result.matched) {
          throw new AppError('REPLAY_WAIT_FOR_REQUEST_TIMEOUT', 'Timed out waiting for matching request.', {
            action,
            checked: result.checked
          });
        }
        return {
          checked: result.checked,
          method: result.matched.method,
          requestId: result.matched.id,
          url: result.matched.url
        };
      }
      case 'wait-for-timeout':
        return await this.deps.waitConditionEvaluator.waitForTimeout(action.timeoutMs);
    }
  }

  private async clearInput(selector: string): Promise<void> {
    const page = await this.deps.pageController.getPage();
    await page.evaluate((inputSelector) => {
      const element = document.querySelector(inputSelector) as HTMLInputElement | HTMLTextAreaElement | null;
      if (!element) {
        return;
      }
      element.focus();
      element.value = '';
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector);
  }

  private async submit(selector: string): Promise<Record<string, unknown>> {
    const page = await this.deps.pageController.getPage();
    return await page.evaluate((submitSelector) => {
      const element = document.querySelector(submitSelector) as HTMLElement | null;
      if (!element) {
        throw new Error(`Element not found: ${submitSelector}`);
      }

      const form = element instanceof HTMLFormElement ? element : element.closest('form');
      if (form) {
        if (typeof form.requestSubmit === 'function') {
          form.requestSubmit();
        } else {
          form.submit();
        }
        return {
          selector: submitSelector,
          submitted: true,
          target: 'form'
        };
      }

      element.click();
      return {
        clicked: true,
        selector: submitSelector,
        target: 'element'
      };
    }, selector);
  }

  private successSummary(action: ReplayAction, details: Record<string, unknown>): string {
    switch (action.type) {
      case 'click':
        return `Clicked ${action.selector}`;
      case 'input':
        return `Input ${String(action.value ?? '').length} character(s) into ${action.selector}`;
      case 'submit':
        return `Submitted via ${action.selector}`;
      case 'evaluate':
        return 'Evaluated expression and captured serializable summary.';
      case 'navigate':
        return `Navigated to ${action.url}`;
      case 'wait-for-selector':
        return `Waited for selector ${action.selector}`;
      case 'wait-for-request':
        return `Observed request ${details.method ?? ''} ${details.url ?? ''}`.trim();
      case 'wait-for-timeout':
        return `Waited ${action.timeoutMs ?? 5_000}ms`;
    }
  }

  private require(value: string | undefined, field: string, actionType: string): void {
    if (typeof value !== 'string' || value.length === 0) {
      throw new AppError('REPLAY_ACTION_FIELD_REQUIRED', `${actionType} requires ${field}.`, {
        actionType,
        field
      });
    }
  }
}
