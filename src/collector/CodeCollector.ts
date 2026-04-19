import type { Page } from 'puppeteer';

import { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import { AppError } from '../core/errors.js';
import { PageController } from '../page/PageController.js';
import type {
  CodeFile,
  CodeFileSummary,
  CollectCodeExternalFailure,
  CollectCodeOptions,
  CollectCodeResult,
  CollectCodeSkippedFile,
  SearchCollectedCodeResult
} from './types.js';

const DEFAULT_MAX_FILE_SIZE = 200_000;
const DEFAULT_MAX_TOTAL_SIZE = 1_000_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const EXTERNAL_FETCH_TIMEOUT_MS = 5_000;
const DEFAULT_SEARCH_LIMIT = 20;
const SEARCH_PREVIEW_RADIUS = 80;

type ScriptDescriptor = {
  content: string | null;
  index: number;
  src: string | null;
};

type ExternalFetchResult =
  | {
      ok: true;
      content: string;
    }
  | {
      ok: false;
      error: string;
    };

export class CodeCollector {
  private readonly collectedFiles = new Map<string, CodeFile>();

  constructor(
    private readonly browserSession: BrowserSessionManager,
    private readonly pageController: PageController
  ) {}

  async collect(options: CollectCodeOptions = {}): Promise<CollectCodeResult> {
    const includeInline = options.includeInline ?? true;
    const includeExternal = options.includeExternal ?? true;
    const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
    const maxTotalSize = options.maxTotalSize ?? DEFAULT_MAX_TOTAL_SIZE;
    const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;

    const page = await this.resolveCollectionPage(options.url, timeout);
    const sourceUrl = page.url();
    const descriptors = await this.collectScriptDescriptors(page);

    const files: CodeFile[] = [];
    const skippedFiles: CollectCodeSkippedFile[] = [];
    const failedExternalScripts: CollectCodeExternalFailure[] = [];
    const warnings: string[] = [];
    let totalSize = 0;

    if (!includeInline && !includeExternal) {
      warnings.push('Both includeInline and includeExternal are false, so no scripts were collected.');
    }

    if (includeInline) {
      for (const descriptor of descriptors) {
        if (descriptor.src !== null) {
          continue;
        }

        const file: CodeFile = {
          content: descriptor.content ?? '',
          size: (descriptor.content ?? '').length,
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
      const externalUrls = Array.from(
        new Set(
          descriptors
            .map((descriptor) => descriptor.src)
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
        )
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

        const fetched = await this.fetchExternalScript(page, externalUrl);
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
      files,
      sourceUrl,
      totalFiles: files.length,
      totalSize
    };
  }

  getCollectedFilesSummary(): CodeFileSummary[] {
    return Array.from(this.collectedFiles.values())
      .map((file) => ({
        size: file.size,
        type: file.type,
        url: file.url
      }))
      .sort((left, right) => left.url.localeCompare(right.url));
  }

  getFileByUrl(url: string): CodeFile | null {
    return this.collectedFiles.get(url) ?? null;
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

    for (const file of this.collectedFiles.values()) {
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

  private async resolveCollectionPage(url: string | undefined, timeout: number): Promise<Page> {
    if (!url) {
      return this.pageController.getPage();
    }

    const selectedPage = await this.browserSession.getSelectedPageOrNull();
    if (selectedPage) {
      try {
        await selectedPage.goto(url, {
          timeout,
          waitUntil: 'domcontentloaded'
        });
      } catch (error) {
        throw new AppError('COLLECT_CODE_NAVIGATION_FAILED', `Failed to navigate selected page before collecting code: ${error instanceof Error ? error.message : String(error)}`, {
          timeout,
          url
        });
      }

      return selectedPage;
    }

    try {
      await this.browserSession.newPage(url, timeout);
    } catch (error) {
      throw new AppError('COLLECT_CODE_NAVIGATION_FAILED', `Failed to open page before collecting code: ${error instanceof Error ? error.message : String(error)}`, {
        timeout,
        url
      });
    }

    return this.pageController.getPage();
  }

  private async collectScriptDescriptors(page: Page): Promise<ScriptDescriptor[]> {
    return page.evaluate(() =>
      Array.from(document.querySelectorAll('script')).map((script, index) => ({
        content: script.src ? null : script.textContent ?? '',
        index,
        src: script.src || null
      }))
    );
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
}
