import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import type { CodeCollector } from '../collector/CodeCollector.js';
import type { HookManager } from '../hook/HookManager.js';
import type { NetworkCollector } from '../network/NetworkCollector.js';
import type { AnalyzeTargetResult } from '../analysis/types.js';
import type { RuntimeFixture } from './types.js';

export class FixtureExtractor {
  constructor(
    private readonly deps: {
      browserSession: BrowserSessionManager;
      codeCollector: CodeCollector;
      hookManager: HookManager;
      networkCollector: NetworkCollector;
    }
  ) {}

  async extractFromCurrentPage(options: {
    maxRequests?: number;
    maxHookSamplesPerHook?: number;
    analyzeTargetResult?: AnalyzeTargetResult | null;
  } = {}): Promise<RuntimeFixture> {
    const page = await this.deps.browserSession.getSelectedPage();
    const title = await this.readTitle(page);
    const requestResult = await this.readRequests(options.maxRequests ?? 20);
    const hookSamples = await this.readHookSamples(page, options.maxHookSamplesPerHook ?? 3);
    const analyzeResult = options.analyzeTargetResult ?? null;

    return {
      createdAt: new Date().toISOString(),
      hookSamples,
      notes: [
        'Fixture is a compact runtime sample for local rebuild probing, not a full browser snapshot.',
        ...(requestResult.warning ? [requestResult.warning] : [])
      ],
      page: {
        title,
        url: page.url()
      },
      requestSamples: requestResult.requests.map((request) => ({
        headers: request.requestHeaders,
        method: request.method,
        postData: request.postData,
        url: request.url
      })),
      selectedCodeFiles: this.deps.codeCollector.getCollectedFilesSummary().slice(0, 20),
      selectedPriorityTargets: analyzeResult?.priorityTargets.map((target) => target.label).slice(0, 20),
      source: 'hook'
    };
  }

  extractFromAnalyzeTargetResult(result: AnalyzeTargetResult): RuntimeFixture {
    return {
      createdAt: new Date().toISOString(),
      hookSamples: [],
      notes: [
        'Fixture was derived from the latest analyze_target result.',
        'Hook records are not embedded in AnalyzeTargetResult; use current-page source if raw hook samples are needed.'
      ],
      page: result.page,
      requestSamples: result.network.recentRequests.map((request) => ({
        headers: request.requestHeaders,
        method: request.method,
        postData: request.postData,
        url: request.url
      })),
      selectedCodeFiles: result.collection.topPriorityFiles.map((file) => ({
        size: file.size,
        type: file.type,
        url: file.url
      })),
      selectedPriorityTargets: result.priorityTargets.map((target) => target.label).slice(0, 20),
      source: 'analyze-target'
    };
  }

  private async readRequests(limit: number): Promise<{
    requests: Awaited<ReturnType<NetworkCollector['listRequests']>>['requests'];
    warning?: string;
  }> {
    try {
      const result = await this.deps.networkCollector.listRequests({ limit });
      const suspicious = result.requests.filter((request) => /sign|signature|token|auth|api|nonce/i.test(request.url) || /^(POST|PUT|PATCH)$/i.test(request.method));
      return {
        requests: suspicious.length > 0 ? suspicious.slice(-limit) : result.requests.slice(-limit)
      };
    } catch (error) {
      return {
        requests: [],
        warning: `Network samples unavailable: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async readHookSamples(
    page: Awaited<ReturnType<BrowserSessionManager['getSelectedPage']>>,
    perHook: number
  ): Promise<RuntimeFixture['hookSamples']> {
    try {
      const data = await this.deps.hookManager.getHookData(page);
      const samples: RuntimeFixture['hookSamples'] = [];

      for (const [hookId, records] of Object.entries(data.records)) {
        for (const record of records.slice(-perHook)) {
          samples.push({
            hookId,
            record,
            target: typeof record.targetPath === 'string' ? record.targetPath : typeof record.type === 'string' ? record.type : undefined
          });
        }
      }

      return samples.slice(-30);
    } catch {
      return [];
    }
  }

  private async readTitle(page: Awaited<ReturnType<BrowserSessionManager['getSelectedPage']>>): Promise<string> {
    try {
      return await page.title();
    } catch {
      return '';
    }
  }
}
