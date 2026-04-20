import puppeteer, { type Browser, type Page } from 'puppeteer';

import { AppError } from '../core/errors.js';
import { logger } from '../core/logger.js';
import { autoConnectBrowser } from './autoConnect.js';
import { getMinimalPreloadScript } from './preload.js';
import type {
  AutoConnectResult,
  BrowserConnectionMode,
  BrowserHealth,
  BrowserSessionOptions,
  PageSummary
} from './types.js';

const DEFAULT_NAVIGATION_TIMEOUT_MS = 10_000;

type RemoteConnectionTarget = {
  browserURL?: string;
  mode: BrowserConnectionMode;
  wsEndpoint?: string;
};

function isBrowserConnected(browser: Browser): boolean {
  const maybeConnected = browser as Browser & {
    connected?: boolean;
    isConnected?: () => boolean;
  };

  if (typeof maybeConnected.connected === 'boolean') {
    return maybeConnected.connected;
  }

  if (typeof maybeConnected.isConnected === 'function') {
    return maybeConnected.isConnected();
  }

  return true;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export class BrowserSessionManager {
  private browser: Browser | null = null;
  private mode: BrowserConnectionMode | null = null;
  private options: BrowserSessionOptions;
  private pageIdSequence = 0;
  private readonly pageIds = new WeakMap<Page, string>();
  private pendingEnsure: Promise<Browser> | null = null;
  private readonly preloadRegisteredPageIds = new Set<string>();
  private selectedPageId: string | null = null;

  constructor(options: BrowserSessionOptions = {}) {
    this.options = { ...options };
  }

  async connect(options: BrowserSessionOptions = this.options): Promise<Browser> {
    const effectiveOptions = this.mergeOptions(options);
    const target = await this.resolveRemoteConnectionTarget(effectiveOptions);

    if (!target) {
      throw new AppError(
        'BROWSER_CONNECTION_CONFIG_INVALID',
        'No remote browser target is configured. Set BROWSER_WS_ENDPOINT, BROWSER_URL, or enable BROWSER_AUTO_CONNECT=true.'
      );
    }

    try {
      const browser = target.wsEndpoint
        ? await puppeteer.connect({ browserWSEndpoint: target.wsEndpoint })
        : await puppeteer.connect({ browserURL: target.browserURL });

      return await this.attachBrowser(browser, target.mode, effectiveOptions);
    } catch (error) {
      throw new AppError('BROWSER_CONNECTION_FAILED', `Failed to connect to browser: ${toErrorMessage(error)}`, {
        browserURL: target.browserURL,
        mode: target.mode,
        wsEndpoint: target.wsEndpoint
      });
    }
  }

  async launch(options: BrowserSessionOptions = this.options): Promise<Browser> {
    const effectiveOptions = this.mergeOptions(options);

    try {
      const browser = await puppeteer.launch({
        executablePath: effectiveOptions.executablePath,
        headless: effectiveOptions.headless ?? false
      });

      return await this.attachBrowser(browser, 'launched-local', effectiveOptions);
    } catch (error) {
      throw new AppError('BROWSER_LAUNCH_FAILED', `Failed to launch local browser: ${toErrorMessage(error)}`, {
        executablePath: effectiveOptions.executablePath,
        headless: effectiveOptions.headless ?? false
      });
    }
  }

  async ensureBrowser(): Promise<Browser> {
    if (this.browser && isBrowserConnected(this.browser)) {
      return this.browser;
    }

    if (this.pendingEnsure) {
      return this.pendingEnsure;
    }

    this.pendingEnsure = this.ensureBrowserInternal();

    try {
      return await this.pendingEnsure;
    } finally {
      this.pendingEnsure = null;
    }
  }

  async close(): Promise<void> {
    const browser = this.browser;
    const mode = this.mode;

    this.browser = null;
    this.mode = null;
    this.selectedPageId = null;
    this.pendingEnsure = null;
    this.preloadRegisteredPageIds.clear();

    if (!browser) {
      return;
    }

    try {
      if (mode === 'launched-local') {
        await browser.close();
      } else {
        browser.disconnect();
      }
    } catch (error) {
      logger.warn('Failed to close browser session cleanly', error);
    }
  }

  async listPages(): Promise<PageSummary[]> {
    return this.refreshPages();
  }

  async refreshPages(): Promise<PageSummary[]> {
    const pages = await this.getTrackedPages();
    return this.toPageSummaries(pages);
  }

  async getSelectedPage(): Promise<Page> {
    const page = await this.getSelectedPageOrNull();
    if (!page) {
      throw new AppError(
        'NO_SELECTED_PAGE',
        'No active page is selected. Use new_page, list_pages, or select_page first.'
      );
    }

    return page;
  }

  async getSelectedPageOrNull(): Promise<Page | null> {
    const pages = await this.getTrackedPages();
    if (!this.selectedPageId) {
      return null;
    }

    return pages.find((page) => this.getPageId(page) === this.selectedPageId) ?? null;
  }

  getPageId(page: Page): string {
    const existingPageId = this.pageIds.get(page);
    if (existingPageId) {
      return existingPageId;
    }

    const target = page.target() as { _targetId?: string };
    const pageId =
      typeof target._targetId === 'string' && target._targetId.length > 0
        ? target._targetId
        : `page-${++this.pageIdSequence}`;

    this.pageIds.set(page, pageId);
    return pageId;
  }

  async selectPage(index: number): Promise<PageSummary> {
    const pages = await this.getTrackedPages();
    const page = pages[index];

    if (!page) {
      throw new AppError('PAGE_INDEX_OUT_OF_RANGE', `Page index ${index} is out of range.`, {
        pageCount: pages.length,
        requestedIndex: index
      });
    }

    this.selectedPageId = this.getPageId(page);

    try {
      await page.bringToFront();
    } catch {
      // Some remote targets may not support focus; selection still remains valid.
    }

    return this.toPageSummary(page, index);
  }

  async newPage(url?: string, timeout = DEFAULT_NAVIGATION_TIMEOUT_MS): Promise<PageSummary> {
    const browser = await this.ensureBrowser();
    const page = await browser.newPage();
    const pageId = this.getPageId(page);

    await this.registerPreload(page, pageId);

    if (url) {
      await page.goto(url, {
        timeout,
        waitUntil: 'domcontentloaded'
      });
    }

    this.selectedPageId = pageId;

    const pages = await this.getTrackedPages();
    const pageIndex = pages.findIndex((candidate) => this.getPageId(candidate) === pageId);

    if (pageIndex === -1) {
      throw new AppError('PAGE_TRACKING_FAILED', 'The newly created page could not be tracked.');
    }

    return this.toPageSummary(pages[pageIndex], pageIndex);
  }

  async closePage(index: number): Promise<{ closed: boolean }> {
    const pages = await this.getTrackedPages();
    const page = pages[index];

    if (!page) {
      throw new AppError('PAGE_INDEX_OUT_OF_RANGE', `Page index ${index} is out of range.`, {
        pageCount: pages.length,
        requestedIndex: index
      });
    }

    const pageId = this.getPageId(page);

    await page.close();

    if (this.selectedPageId === pageId) {
      this.selectedPageId = null;
    }

    await this.refreshPages();

    return { closed: true };
  }

  async navigateSelectedPage(params: {
    timeout?: number;
    type?: 'url' | 'back' | 'forward' | 'reload';
    url?: string;
  }): Promise<{
    navigation: {
      finalUrl: string;
      success: boolean;
      type: 'url' | 'back' | 'forward' | 'reload';
    };
    page: PageSummary;
  }> {
    const page = await this.getSelectedPage();
    const navigationType = params.type ?? 'url';
    const timeout = params.timeout ?? DEFAULT_NAVIGATION_TIMEOUT_MS;

    if (navigationType === 'url' && (!params.url || params.url.length === 0)) {
      throw new AppError('NAVIGATION_URL_REQUIRED', 'navigate_page requires a url when type=url.');
    }

    try {
      switch (navigationType) {
        case 'url':
          await page.goto(params.url!, {
            timeout,
            waitUntil: 'domcontentloaded'
          });
          break;
        case 'back':
          await page.goBack({
            timeout,
            waitUntil: 'domcontentloaded'
          });
          break;
        case 'forward':
          await page.goForward({
            timeout,
            waitUntil: 'domcontentloaded'
          });
          break;
        case 'reload':
          await page.reload({
            timeout,
            waitUntil: 'domcontentloaded'
          });
          break;
      }
    } catch (error) {
      throw new AppError('PAGE_NAVIGATION_FAILED', `Failed to navigate page: ${toErrorMessage(error)}`, {
        timeout,
        type: navigationType,
        url: params.url
      });
    }

    const pages = await this.getTrackedPages();
    const pageIndex = pages.findIndex((candidate) => this.getPageId(candidate) === this.getPageId(page));

    if (pageIndex === -1) {
      throw new AppError('PAGE_TRACKING_FAILED', 'The selected page was lost after navigation.');
    }

    return {
      navigation: {
        finalUrl: pages[pageIndex].url(),
        success: true,
        type: navigationType
      },
      page: await this.toPageSummary(pages[pageIndex], pageIndex)
    };
  }

  async getHealth(): Promise<BrowserHealth> {
    const issues: string[] = [];
    let browser = this.browser;

    if (!browser || !isBrowserConnected(browser)) {
      try {
        browser = await this.ensureBrowser();
      } catch (error) {
        issues.push(toErrorMessage(error));
        return {
          connected: false,
          issues,
          mode: this.mode,
          pagesCount: 0,
          selectedPageIndex: null,
          selectedPageTitle: null,
          selectedPageUrl: null
        };
      }
    }

    let pages: PageSummary[] = [];
    try {
      pages = await this.refreshPages();
    } catch (error) {
      issues.push(`Failed to refresh page state: ${toErrorMessage(error)}`);
    }

    let browserVersion: string | undefined;
    try {
      browserVersion = await browser.version();
    } catch (error) {
      issues.push(`Failed to read browser version: ${toErrorMessage(error)}`);
    }

    if (!isBrowserConnected(browser)) {
      issues.push('Browser connection is not active.');
    }

    const selectedPage = pages.find((page) => page.isSelected) ?? null;

    return {
      browserVersion,
      connected: isBrowserConnected(browser),
      issues,
      mode: this.mode,
      pagesCount: pages.length,
      selectedPageIndex: selectedPage?.index ?? null,
      selectedPageTitle: selectedPage?.title ?? null,
      selectedPageUrl: selectedPage?.url ?? null
    };
  }

  private async ensureBrowserInternal(): Promise<Browser> {
    const remoteTarget = await this.resolveRemoteConnectionTarget(this.options);
    if (remoteTarget) {
      return this.connect(this.options);
    }

    return this.launch(this.options);
  }

  private mergeOptions(options: BrowserSessionOptions): BrowserSessionOptions {
    const merged = {
      ...this.options,
      ...options
    };

    this.options = merged;
    return merged;
  }

  private async resolveRemoteConnectionTarget(
    options: BrowserSessionOptions
  ): Promise<RemoteConnectionTarget | null> {
    if (options.wsEndpoint) {
      return {
        mode: 'remote-ws-endpoint',
        wsEndpoint: options.wsEndpoint
      };
    }

    if (options.browserURL) {
      return {
        browserURL: options.browserURL,
        mode: 'remote-browser-url'
      };
    }

    if (!options.autoConnect) {
      return null;
    }

    const detected = await autoConnectBrowser();
    if (!detected) {
      return null;
    }

    return this.toAutoConnectedTarget(detected);
  }

  private toAutoConnectedTarget(detected: AutoConnectResult): RemoteConnectionTarget {
    return {
      browserURL: detected.browserURL,
      mode: 'auto-connected',
      wsEndpoint: detected.wsEndpoint
    };
  }

  private async attachBrowser(
    browser: Browser,
    mode: BrowserConnectionMode,
    options: BrowserSessionOptions
  ): Promise<Browser> {
    if (this.browser && this.browser !== browser) {
      await this.disposeBrowser(this.browser, this.mode);
    }

    this.browser = browser;
    this.mode = mode;
    this.options = options;
    this.preloadRegisteredPageIds.clear();

    browser.once('disconnected', () => {
      if (this.browser === browser) {
        this.browser = null;
        this.mode = null;
        this.selectedPageId = null;
        this.preloadRegisteredPageIds.clear();
      }
    });

    await this.refreshPages();

    return browser;
  }

  private async disposeBrowser(browser: Browser, mode: BrowserConnectionMode | null): Promise<void> {
    try {
      if (mode === 'launched-local') {
        await browser.close();
      } else {
        browser.disconnect();
      }
    } catch (error) {
      logger.warn('Failed to dispose previous browser session', error);
    }
  }

  private async getTrackedPages(): Promise<Page[]> {
    const browser = await this.ensureBrowser();
    const pages = await browser.pages();

    for (const page of pages) {
      await this.registerPreload(page, this.getPageId(page));
    }

    this.syncSelectedPage(pages);
    return pages;
  }

  private syncSelectedPage(pages: readonly Page[]): void {
    if (pages.length === 0) {
      this.selectedPageId = null;
      return;
    }

    if (this.selectedPageId && pages.some((page) => this.getPageId(page) === this.selectedPageId)) {
      return;
    }

    this.selectedPageId = this.getPageId(pages[pages.length - 1]);
  }

  private async registerPreload(page: Page, pageId: string): Promise<void> {
    if (this.preloadRegisteredPageIds.has(pageId)) {
      return;
    }

    try {
      await page.evaluateOnNewDocument(getMinimalPreloadScript());
      this.preloadRegisteredPageIds.add(pageId);
    } catch (error) {
      logger.warn('Failed to register preload script', {
        error: toErrorMessage(error),
        pageId
      });
    }
  }

  private async toPageSummaries(pages: readonly Page[]): Promise<PageSummary[]> {
    return Promise.all(pages.map((page, index) => this.toPageSummary(page, index)));
  }

  private async toPageSummary(page: Page, index: number): Promise<PageSummary> {
    const id = this.getPageId(page);
    let title = '';

    try {
      title = await page.title();
    } catch {
      title = '';
    }

    return {
      id,
      index,
      isSelected: this.selectedPageId === id,
      title,
      url: this.getPageUrl(page)
    };
  }

  private getPageUrl(page: Page): string {
    try {
      return page.url();
    } catch {
      return '';
    }
  }
}
