import { Buffer } from 'node:buffer';
import { setTimeout as delay } from 'node:timers/promises';

import type { CDPSession, Page } from 'puppeteer';

import { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import { AppError } from '../core/errors.js';
import { PageController } from '../page/PageController.js';
import { compileCollectorPattern, isLikelyJavaScriptResponse, isLikelyJavaScriptUrl } from './matching.js';
import { rankCodeFiles } from './ranking.js';
import type {
  CodeCollectionDiffResult,
  CodeFile,
  CodeFileSummary,
  CollectCodeExternalFailure,
  CollectCodeOptions,
  CollectCodeResult,
  CollectCodeSkippedFile,
  PatternCollectedCodeResult,
  SearchCollectedCodeResult,
  TopPriorityCollectedCodeResult
} from './types.js';

const DEFAULT_MAX_FILE_SIZE = 200_000;
const DEFAULT_MAX_TOTAL_SIZE = 1_000_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_DYNAMIC_WAIT_MS = 1_000;
const EXTERNAL_FETCH_TIMEOUT_MS = 5_000;
const DEFAULT_SEARCH_LIMIT = 20;
const DEFAULT_PATTERN_LIMIT = 20;
const DEFAULT_TOP_N = 10;
const SEARCH_PREVIEW_RADIUS = 80;

interface InlineScriptDescriptor {
  index: number;
  content: string;
}

interface ScriptInventory {
  inlineScripts: InlineScriptDescriptor[];
  externalUrls: string[];
}

type ExternalFetchResult =
  | {
      ok: true;
      content: string;
    }
  | {
      ok: false;
      error: string;
    };

interface TemporaryScriptCapture {
  stop(): Promise<Map<string, string>>;
}

export class CodeCollector {
  private readonly collectedFiles = new Map<string, CodeFile>();

  constructor(
    private readonly browserSession: BrowserSessionManager,
    private readonly pageController: PageController
  ) {}

  async collect(options: CollectCodeOptions = {}): Promise<CollectCodeResult> {
    const includeInline = options.includeInline ?? true;
    const includeExternal = options.includeExternal ?? true;
    const includeDynamic = options.includeDynamic ?? false;
    const dynamicWaitMs = options.dynamicWaitMs ?? DEFAULT_DYNAMIC_WAIT_MS;
    const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
    const maxTotalSize = options.maxTotalSize ?? DEFAULT_MAX_TOTAL_SIZE;
    const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;

    const page = await this.resolveCollectionPage(options.url);
    const capture = includeExternal ? await this.startTemporaryScriptCapture(page) : null;

    try {
      if (options.url) {
        await this.navigateForCollection(page, options.url, timeout);
      }

      if (includeDynamic && dynamicWaitMs > 0) {
        await delay(dynamicWaitMs);
      }

      const inventory = await this.collectScriptInventory(page);
      const capturedScriptBodies = capture ? await capture.stop() : new Map<string, string>();
      const sourceUrl = this.getPageUrl(page);

      const files: CodeFile[] = [];
      const skippedFiles: CollectCodeSkippedFile[] = [];
      const failedExternalScripts: CollectCodeExternalFailure[] = [];
      const warnings: string[] = [];
      let totalSize = 0;

      if (!includeInline && !includeExternal) {
        warnings.push('Both includeInline and includeExternal are false, so no scripts were collected.');
      }

      if (includeInline) {
        for (const descriptor of inventory.inlineScripts) {
          const file: CodeFile = {
            content: descriptor.content,
            size: descriptor.content.length,
            type: 'inline',
            url: `${sourceUrl}#inline-${descriptor.index}`
          };

          const decision = this.tryIncludeFile(file, totalSize, maxFileSize, maxTotalSize);
          if (decision.include) {
            files.push(file);
            totalSize += file.size;
          } else if (decision.reason) {
            skippedFiles.push({
              reason: decision.reason,
              type: file.type,
              url: file.url
            });
          }
        }
      }

      if (includeExternal) {
        const externalUrls = Array.from(new Set([...inventory.externalUrls, ...capturedScriptBodies.keys()])).sort((left, right) =>
          left.localeCompare(right)
        );

        for (const externalUrl of externalUrls) {
          if (totalSize >= maxTotalSize) {
            skippedFiles.push({
              reason: `Skipped because maxTotalSize=${maxTotalSize} was reached.`,
              type: 'external',
              url: externalUrl
            });
            continue;
          }

          const content = capturedScriptBodies.get(externalUrl);
          const fetched = content === undefined ? await this.fetchExternalScript(page, externalUrl) : { content, ok: true as const };
          if (!fetched.ok) {
            failedExternalScripts.push({
              reason: fetched.error,
              url: externalUrl
            });
            continue;
          }

          const file: CodeFile = {
            content: fetched.content,
            size: fetched.content.length,
            type: 'external',
            url: externalUrl
          };

          const decision = this.tryIncludeFile(file, totalSize, maxFileSize, maxTotalSize);
          if (decision.include) {
            files.push(file);
            totalSize += file.size;
          } else if (decision.reason) {
            skippedFiles.push({
              reason: decision.reason,
              type: file.type,
              url: file.url
            });
          }
        }
      }

      this.collectedFiles.clear();
      for (const file of files) {
        this.collectedFiles.set(file.url, file);
      }

      return {
        ...(failedExternalScripts.length > 0 ? { failedExternalScripts } : {}),
        ...(skippedFiles.length > 0 ? { skippedFiles } : {}),
        ...(warnings.length > 0 ? { warnings } : {}),
        collectedAt: new Date().toISOString(),
        files: files.map((file) => ({ ...file })),
        sourceUrl,
        totalFiles: files.length,
        totalSize
      };
    } finally {
      if (capture) {
        await capture.stop();
      }
    }
  }

  getCollectedFilesSummary(): CodeFileSummary[] {
    return this.getCollectedFiles()
      .map((file) => ({
        size: file.size,
        type: file.type,
        url: file.url
      }))
      .sort((left, right) => left.url.localeCompare(right.url));
  }

  getFileByUrl(url: string): CodeFile | null {
    const file = this.collectedFiles.get(url);
    return file ? { ...file } : null;
  }

  getFilesByPattern(
    pattern: string,
    limit = DEFAULT_PATTERN_LIMIT,
    maxTotalSize = DEFAULT_MAX_TOTAL_SIZE
  ): PatternCollectedCodeResult {
    const expression = compileCollectorPattern(pattern);
    const normalizedLimit = Math.max(1, limit);
    const matchedFiles = this.getCollectedFiles().filter((file) => expression.test(file.url));
    const returnedFiles: CodeFile[] = [];
    let totalSize = 0;
    let truncated = false;

    for (const file of matchedFiles) {
      if (returnedFiles.length >= normalizedLimit || totalSize + file.size > maxTotalSize) {
        truncated = true;
        continue;
      }

      returnedFiles.push({ ...file });
      totalSize += file.size;
    }

    return {
      files: returnedFiles,
      matched: matchedFiles.length,
      pattern,
      returned: returnedFiles.length,
      totalSize,
      truncated
    };
  }

  getTopPriorityFiles(topN = DEFAULT_TOP_N, maxTotalSize = DEFAULT_MAX_TOTAL_SIZE): TopPriorityCollectedCodeResult {
    const normalizedTopN = Math.max(1, topN);
    const rankedFiles = rankCodeFiles(this.getCollectedFiles());
    const returnedFiles: TopPriorityCollectedCodeResult['files'] = [];
    let totalSize = 0;
    let truncated = false;

    for (const file of rankedFiles) {
      if (returnedFiles.length >= normalizedTopN || totalSize + file.size > maxTotalSize) {
        truncated = true;
        continue;
      }

      returnedFiles.push({
        ...file
      });
      totalSize += file.size;
    }

    return {
      files: returnedFiles,
      returned: returnedFiles.length,
      topN: normalizedTopN,
      totalSize,
      truncated
    };
  }

  diffSummaries(
    previous: readonly CodeFileSummary[],
    current: readonly CodeFileSummary[] = this.getCollectedFilesSummary(),
    includeUnchanged = false
  ): CodeCollectionDiffResult {
    const previousByUrl = new Map(previous.map((entry) => [entry.url, entry]));
    const currentByUrl = new Map(current.map((entry) => [entry.url, entry]));
    const added: CodeFileSummary[] = [];
    const removed: CodeFileSummary[] = [];
    const changed: CodeCollectionDiffResult['changed'] = [];
    const unchanged: CodeFileSummary[] = [];

    for (const currentEntry of current) {
      const previousEntry = previousByUrl.get(currentEntry.url);
      if (!previousEntry) {
        added.push(currentEntry);
        continue;
      }

      if (previousEntry.size !== currentEntry.size || previousEntry.type !== currentEntry.type) {
        changed.push({
          current: currentEntry,
          previous: previousEntry
        });
        continue;
      }

      if (includeUnchanged) {
        unchanged.push(currentEntry);
      }
    }

    for (const previousEntry of previous) {
      if (!currentByUrl.has(previousEntry.url)) {
        removed.push(previousEntry);
      }
    }

    return {
      added: added.sort((left, right) => left.url.localeCompare(right.url)),
      changed: changed.sort((left, right) => left.current.url.localeCompare(right.current.url)),
      ...(includeUnchanged ? { unchanged: unchanged.sort((left, right) => left.url.localeCompare(right.url)) } : {}),
      removed: removed.sort((left, right) => left.url.localeCompare(right.url))
    };
  }

  searchInCollectedCode(pattern: string, limit = DEFAULT_SEARCH_LIMIT): SearchCollectedCodeResult {
    const normalizedLimit = Math.max(1, limit);
    let expression: RegExp;

    try {
      expression = new RegExp(pattern, 'g');
    } catch (error) {
      throw new AppError('INVALID_REGEX', `Invalid regular expression: ${error instanceof Error ? error.message : String(error)}`, {
        pattern
      });
    }

    const results: SearchCollectedCodeResult['results'] = [];
    let matched = 0;

    for (const file of this.getCollectedFiles()) {
      expression.lastIndex = 0;
      const matches: SearchCollectedCodeResult['results'][number]['matches'] = [];
      let currentMatch: RegExpExecArray | null;

      while ((currentMatch = expression.exec(file.content)) !== null) {
        matches.push({
          index: currentMatch.index,
          preview: this.buildPreview(file.content, currentMatch.index, currentMatch[0]?.length ?? 0)
        });
        matched += 1;

        if ((currentMatch[0] ?? '').length === 0) {
          expression.lastIndex += 1;
        }

        if (matched >= normalizedLimit) {
          break;
        }
      }

      if (matches.length > 0) {
        results.push({
          matches,
          url: file.url
        });
      }

      if (matched >= normalizedLimit) {
        break;
      }
    }

    return {
      matched,
      pattern,
      results
    };
  }

  clear(): void {
    this.collectedFiles.clear();
  }

  private async resolveCollectionPage(url: string | undefined): Promise<Page> {
    if (!url) {
      return this.pageController.getPage();
    }

    const selectedPage = await this.browserSession.getSelectedPageOrNull();
    if (selectedPage) {
      return selectedPage;
    }

    await this.browserSession.newPage();
    return this.browserSession.getSelectedPage();
  }

  private async navigateForCollection(page: Page, url: string, timeout: number): Promise<void> {
    try {
      await page.goto(url, {
        timeout,
        waitUntil: 'domcontentloaded'
      });
    } catch (error) {
      throw new AppError('COLLECT_CODE_NAVIGATION_FAILED', `Failed to navigate page before collecting code: ${error instanceof Error ? error.message : String(error)}`, {
        timeout,
        url
      });
    }
  }

  private async collectScriptInventory(page: Page): Promise<ScriptInventory> {
    return page.evaluate(() => {
      const inlineScripts = Array.from(document.querySelectorAll('script'))
        .filter((script) => !script.src)
        .map((script, index) => ({
          content: script.textContent ?? '',
          index
        }));

      const externalUrls = new Set<string>();
      for (const script of Array.from(document.querySelectorAll('script[src]')) as HTMLScriptElement[]) {
        if (script.src) {
          externalUrls.add(script.src);
        }
      }

      if (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
        for (const entry of performance.getEntriesByType('resource')) {
          const resourceEntry = entry as PerformanceResourceTiming & {
            name?: string;
            initiatorType?: string;
          };
          const resourceUrl = typeof resourceEntry.name === 'string' ? resourceEntry.name : '';
          const initiatorType = typeof resourceEntry.initiatorType === 'string' ? resourceEntry.initiatorType : '';

          if (initiatorType === 'script' || /\.m?js(?:$|[?#])/i.test(resourceUrl)) {
            externalUrls.add(resourceUrl);
          }
        }
      }

      return {
        externalUrls: Array.from(externalUrls).sort((left, right) => left.localeCompare(right)),
        inlineScripts
      };
    });
  }

  private async fetchExternalScript(page: Page, scriptUrl: string): Promise<ExternalFetchResult> {
    return page.evaluate(
      async ({ scriptUrl: currentScriptUrl, timeoutMs }) => {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

        try {
          const response = await fetch(currentScriptUrl, {
            credentials: 'include',
            signal: controller.signal
          });

          if (!response.ok) {
            return {
              error: `HTTP ${response.status}`,
              ok: false as const
            };
          }

          return {
            content: await response.text(),
            ok: true as const
          };
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error),
            ok: false as const
          };
        } finally {
          clearTimeout(timeoutId);
        }
      },
      {
        scriptUrl,
        timeoutMs: EXTERNAL_FETCH_TIMEOUT_MS
      }
    );
  }

  private async startTemporaryScriptCapture(page: Page): Promise<TemporaryScriptCapture | null> {
    let session: CDPSession;

    try {
      session = await page.target().createCDPSession();
      await session.send('Network.enable');
    } catch {
      return null;
    }

    const responseMap = new Map<string, { url: string }>();
    const scriptBodies = new Map<string, string>();
    const bodyTasks = new Set<Promise<void>>();
    let stopped = false;

    session.on('Network.responseReceived', (event) => {
      const normalizedEvent = event as unknown as Record<string, unknown>;
      const requestId = typeof normalizedEvent.requestId === 'string' ? normalizedEvent.requestId : null;
      const resourceType = typeof normalizedEvent.type === 'string' ? normalizedEvent.type : undefined;
      const response =
        typeof normalizedEvent.response === 'object' && normalizedEvent.response !== null
          ? (normalizedEvent.response as Record<string, unknown>)
          : undefined;
      const url = typeof response?.url === 'string' ? response.url : undefined;
      const mimeType = typeof response?.mimeType === 'string' ? response.mimeType : undefined;

      if (!requestId || !isLikelyJavaScriptResponse(url, mimeType, resourceType)) {
        return;
      }

      if (url) {
        responseMap.set(requestId, { url });
      }
    });

    session.on('Network.loadingFinished', (event) => {
      const normalizedEvent = event as unknown as Record<string, unknown>;
      const requestId = typeof normalizedEvent.requestId === 'string' ? normalizedEvent.requestId : null;
      if (!requestId) {
        return;
      }

      const responseMeta = responseMap.get(requestId);
      if (!responseMeta) {
        return;
      }

      const task = (async () => {
        try {
          const bodyResult = (await session.send('Network.getResponseBody', { requestId })) as {
            base64Encoded?: boolean;
            body?: string;
          };
          const body = typeof bodyResult.body === 'string' ? bodyResult.body : '';
          const normalizedBody =
            bodyResult.base64Encoded === true ? Buffer.from(body, 'base64').toString('utf8') : body;

          if (normalizedBody.length > 0 && isLikelyJavaScriptUrl(responseMeta.url)) {
            scriptBodies.set(responseMeta.url, normalizedBody);
          } else if (normalizedBody.length > 0) {
            scriptBodies.set(responseMeta.url, normalizedBody);
          }
        } catch {
          // Best-effort capture only.
        } finally {
          responseMap.delete(requestId);
        }
      })();

      bodyTasks.add(task);
      void task.finally(() => {
        bodyTasks.delete(task);
      });
    });

    session.on('Network.loadingFailed', (event) => {
      const normalizedEvent = event as unknown as Record<string, unknown>;
      const requestId = typeof normalizedEvent.requestId === 'string' ? normalizedEvent.requestId : null;
      if (requestId) {
        responseMap.delete(requestId);
      }
    });

    return {
      stop: async () => {
        if (stopped) {
          return new Map(scriptBodies);
        }

        stopped = true;
        await Promise.allSettled(Array.from(bodyTasks));

        try {
          await session.detach();
        } catch {
          // Ignore detach failures for best-effort capture.
        }

        return new Map(scriptBodies);
      }
    };
  }

  private tryIncludeFile(
    file: CodeFile,
    currentTotalSize: number,
    maxFileSize: number,
    maxTotalSize: number
  ): {
    include: boolean;
    reason?: string;
  } {
    if (file.size > maxFileSize) {
      return {
        include: false,
        reason: `Skipped because file size ${file.size} exceeds maxFileSize=${maxFileSize}.`
      };
    }

    if (currentTotalSize + file.size > maxTotalSize) {
      return {
        include: false,
        reason: `Skipped because total size would exceed maxTotalSize=${maxTotalSize}.`
      };
    }

    return {
      include: true
    };
  }

  private buildPreview(content: string, index: number, matchLength: number): string {
    const start = Math.max(0, index - SEARCH_PREVIEW_RADIUS);
    const end = Math.min(content.length, index + Math.max(matchLength, 1) + SEARCH_PREVIEW_RADIUS);
    return content.slice(start, end).replace(/\s+/g, ' ').trim();
  }

  private getCollectedFiles(): CodeFile[] {
    return Array.from(this.collectedFiles.values())
      .map((file) => ({ ...file }))
      .sort((left, right) => left.url.localeCompare(right.url));
  }

  private getPageUrl(page: Page): string {
    try {
      return page.url();
    } catch {
      return '';
    }
  }
}
