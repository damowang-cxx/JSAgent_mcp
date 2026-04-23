import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ElementHandle, Page } from 'puppeteer';

import { AppError } from '../core/errors.js';
import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { PageController } from '../page/PageController.js';
import type { DomQueryResult } from './types.js';

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_DOM_LIMIT = 10;
const MAX_DOM_LIMIT = 50;

export class DomInspector {
  constructor(
    private readonly deps: {
      browserSession: BrowserSessionManager;
      pageController: PageController;
      evidenceStore: EvidenceStore;
    }
  ) {}

  async query(options: {
    selector: string;
    all?: boolean;
    limit?: number;
  }): Promise<DomQueryResult> {
    const page = await this.getPage();
    const limit = normalizeLimit(options.limit);
    return await page.evaluate(
      ({ all, limit, selector }) => {
        const matched = Array.from(document.querySelectorAll(selector));
        const selected = (all ? matched : matched.slice(0, 1)).slice(0, limit);

        return {
          all,
          count: matched.length,
          items: selected.map((element, index) => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            const visible = Boolean(
              rect.width > 0 &&
              rect.height > 0 &&
              style.visibility !== 'hidden' &&
              style.display !== 'none' &&
              Number(style.opacity || '1') > 0
            );
            const attributes = Array.from(element.attributes)
              .slice(0, 30)
              .reduce<Record<string, string>>((accumulator, attribute) => {
                accumulator[attribute.name] = attribute.value.slice(0, 300);
                return accumulator;
              }, {});
            const tag = element.tagName.toLowerCase();
            const role = element.getAttribute('role') ?? '';
            const clickable = visible &&
              (['a', 'button', 'input', 'select', 'textarea', 'label'].includes(tag) ||
                role === 'button' ||
                role === 'link' ||
                typeof (element as HTMLElement).onclick === 'function' ||
                style.cursor === 'pointer');

            return {
              attributes,
              boundingBox: rect.width > 0 || rect.height > 0
                ? {
                    height: rect.height,
                    width: rect.width,
                    x: rect.x,
                    y: rect.y
                  }
                : null,
              clickable,
              htmlTag: tag,
              selector: `${selector}::${index}`,
              text: (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 500),
              visible
            };
          }),
          selector
        };
      },
      {
        all: options.all ?? false,
        limit,
        selector: options.selector
      }
    );
  }

  async click(options: {
    selector: string;
    timeoutMs?: number;
  }): Promise<{ clicked: boolean; selector: string; notes?: string[] }> {
    const page = await this.getPage();
    await this.waitForSelector(page, options.selector, options.timeoutMs, true);
    await page.click(options.selector);
    return {
      clicked: true,
      notes: ['Clicked the first visible element matching the selector on the selected page.'],
      selector: options.selector
    };
  }

  async type(options: {
    selector: string;
    text: string;
    delayMs?: number;
    clearFirst?: boolean;
    timeoutMs?: number;
  }): Promise<{ typed: boolean; selector: string; textLength: number }> {
    const page = await this.getPage();
    await this.waitForSelector(page, options.selector, options.timeoutMs, true);

    if (options.clearFirst) {
      await page.$eval(options.selector, (element) => {
        const target = element as HTMLInputElement | HTMLTextAreaElement;
        target.focus();
        if ('value' in target) {
          target.value = '';
          target.dispatchEvent(new Event('input', { bubbles: true }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          element.textContent = '';
        }
      });
    }

    await page.type(options.selector, options.text, options.delayMs === undefined ? undefined : { delay: options.delayMs });
    return {
      selector: options.selector,
      textLength: options.text.length,
      typed: true
    };
  }

  async waitFor(options: {
    selector: string;
    timeoutMs?: number;
    visible?: boolean;
  }): Promise<{ found: boolean; selector: string; waitedMs: number }> {
    const page = await this.getPage();
    const startedAt = Date.now();
    await this.waitForSelector(page, options.selector, options.timeoutMs, options.visible ?? false);
    return {
      found: true,
      selector: options.selector,
      waitedMs: Date.now() - startedAt
    };
  }

  async takeScreenshot(options: {
    fullPage?: boolean;
    selector?: string;
    format?: 'png' | 'jpeg';
    quality?: number;
    taskId?: string;
  }): Promise<{ path?: string; format: string; fullPage: boolean; selector?: string | null }> {
    const page = await this.getPage();
    const format = options.format ?? 'png';
    const outputPath = await this.resolveScreenshotPath(options.taskId, format);
    const screenshotOptions = {
      path: outputPath,
      type: format,
      ...(format === 'jpeg' && options.quality ? { quality: clampQuality(options.quality) } : {})
    } as const;

    if (options.selector) {
      const handle = await this.waitForSelector(page, options.selector, undefined, true);
      await this.screenshotElement(handle, screenshotOptions);
    } else {
      await page.screenshot({
        ...screenshotOptions,
        fullPage: options.fullPage ?? false
      });
    }

    return {
      format,
      fullPage: options.selector ? false : options.fullPage ?? false,
      path: outputPath,
      selector: options.selector ?? null
    };
  }

  private async getPage(): Promise<Page> {
    return await this.deps.pageController.getPage();
  }

  private async waitForSelector(
    page: Page,
    selector: string,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    visible = false
  ): Promise<ElementHandle<Element>> {
    try {
      const handle = await page.waitForSelector(selector, {
        timeout: timeoutMs,
        visible
      });
      if (!handle) {
        throw new Error('Selector returned no handle.');
      }
      return handle as ElementHandle<Element>;
    } catch (error) {
      throw new AppError('BROWSER_ELEMENT_NOT_FOUND', `Element not found for selector: ${selector}`, {
        selector,
        timeoutMs,
        visible,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async screenshotElement(
    handle: ElementHandle<Element>,
    options: {
      path: string;
      type: 'png' | 'jpeg';
      quality?: number;
    }
  ): Promise<void> {
    await handle.screenshot(options);
  }

  private async resolveScreenshotPath(taskId: string | undefined, format: 'png' | 'jpeg'): Promise<string> {
    const baseDir = taskId
      ? path.join(this.deps.evidenceStore.getTaskDir(taskId), 'browser-ops', 'screenshots')
      : path.resolve(process.cwd(), 'artifacts', 'browser-ops', 'screenshots');
    await mkdir(baseDir, { recursive: true });
    if (taskId) {
      await this.deps.evidenceStore.openTask({ taskId });
    }
    const fileName = `screenshot-${Date.now()}.${format === 'jpeg' ? 'jpg' : 'png'}`;
    const outputPath = path.join(baseDir, fileName);
    await writeFile(outputPath, '');
    return outputPath;
  }
}

function normalizeLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_DOM_LIMIT, 1), MAX_DOM_LIMIT);
}

function clampQuality(value: number): number {
  return Math.min(Math.max(Math.round(value), 1), 100);
}
