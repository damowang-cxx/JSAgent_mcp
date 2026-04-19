import type { Page } from 'puppeteer';

import { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import type { QueryDomResult } from './types.js';

export class PageController {
  constructor(private readonly browserSession: BrowserSessionManager) {}

  async getPage(): Promise<Page> {
    return this.browserSession.getSelectedPage();
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    const page = await this.getPage();
    return page.evaluate((source) => (0, eval)(source), expression) as Promise<T>;
  }

  async getUrl(): Promise<string> {
    const page = await this.getPage();
    return page.url();
  }

  async getTitle(): Promise<string> {
    const page = await this.getPage();
    return page.title();
  }

  async getContent(): Promise<string> {
    const page = await this.getPage();
    return page.content();
  }

  async click(selector: string): Promise<{ success: boolean; selector: string }> {
    const page = await this.getPage();
    await page.click(selector);

    return {
      selector,
      success: true
    };
  }

  async type(
    selector: string,
    text: string,
    delay?: number
  ): Promise<{ success: boolean; selector: string; length: number }> {
    const page = await this.getPage();
    await page.type(selector, text, delay === undefined ? undefined : { delay });

    return {
      length: text.length,
      selector,
      success: true
    };
  }

  async waitForSelector(selector: string, timeout?: number): Promise<{ success: boolean; selector: string }> {
    const page = await this.getPage();
    await page.waitForSelector(selector, timeout === undefined ? undefined : { timeout });

    return {
      selector,
      success: true
    };
  }

  async queryDom(selector: string, all = false, limit = 10): Promise<QueryDomResult> {
    const page = await this.getPage();
    return page.evaluate(
      ({ all, limit, selector: domSelector }) => {
        const matched = Array.from(document.querySelectorAll(domSelector));
        const normalizedLimit = Math.max(1, limit);
        const selected = (all ? matched : matched.slice(0, 1)).slice(0, normalizedLimit);

        return {
          elements: selected.map((element) => {
            const attributes = Array.from(element.attributes).reduce<Record<string, string>>((accumulator, attribute) => {
              accumulator[attribute.name] = attribute.value;
              return accumulator;
            }, {});

            return {
              attributes,
              className: element.getAttribute('class'),
              id: element.id || null,
              tagName: element.tagName.toLowerCase(),
              textContent: element.textContent?.trim().slice(0, 200) || null
            };
          }),
          total: matched.length
        };
      },
      {
        all,
        limit,
        selector
      }
    );
  }
}
