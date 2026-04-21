import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import type { CodeCollector } from '../collector/CodeCollector.js';
import type { RequestChainCorrelator } from '../correlation/RequestChainCorrelator.js';
import type { HookManager } from '../hook/HookManager.js';
import type { NetworkCollector } from '../network/NetworkCollector.js';
import {
  extractRequestSinksFromCode,
  requestPatternLabel
} from './heuristics.js';
import {
  clampScore,
  dedupeBy,
  normalizeUrlPattern,
  targetMatches,
  toRecord,
  uniqueStrings
} from './normalization.js';
import type { RequestSinkResult } from './types.js';

interface RequestSinkLocatorDeps {
  browserSession: BrowserSessionManager;
  codeCollector: CodeCollector;
  hookManager: HookManager;
  networkCollector: NetworkCollector;
  requestChainCorrelator: RequestChainCorrelator;
}

type SinkEntry = RequestSinkResult['sinks'][number];

const DEFAULT_TOP_N = 8;

export class RequestSinkLocator {
  constructor(private readonly deps: RequestSinkLocatorDeps) {}

  async locate(options: { targetUrl?: string; topN?: number } = {}): Promise<RequestSinkResult> {
    const topN = Math.max(1, options.topN ?? DEFAULT_TOP_N);
    const notes: string[] = [];
    const sinks: SinkEntry[] = [];

    sinks.push(...this.locateCodeSinks(options.targetUrl, topN, notes));
    sinks.push(...await this.locateHookSinks(options.targetUrl, notes));
    sinks.push(...await this.locateNetworkInitiatorSinks(options.targetUrl, notes));
    sinks.push(...await this.locateCorrelationSinks(options.targetUrl, notes));

    const merged = this.mergeSinks(sinks)
      .sort((left, right) => right.score - left.score || left.sink.localeCompare(right.sink))
      .slice(0, topN);

    if (merged.length === 0) {
      notes.push('No request sink was located from collected code, hook records, network initiators, or correlation flows.');
    }

    return {
      notes,
      sinks: merged,
      topSink: merged[0]?.sink ?? null
    };
  }

  private locateCodeSinks(targetUrl: string | undefined, topN: number, notes: string[]): SinkEntry[] {
    let files;
    try {
      files = this.deps.codeCollector.getTopPriorityFiles(topN).files;
    } catch (error) {
      notes.push(`Unable to read top-priority code files: ${this.toMessage(error)}`);
      return [];
    }

    if (files.length === 0) {
      notes.push('No collected code files are available for request sink scanning.');
      return [];
    }

    return files.flatMap((file) =>
      extractRequestSinksFromCode(file.content, file.url, targetUrl).map((hit) => ({
        candidateFunctions: hit.candidateFunctions,
        reasons: [
          ...hit.reasons,
          hit.file ? `file ${hit.file}` : ''
        ].filter(Boolean),
        relatedUrls: hit.relatedUrls,
        score: hit.score,
        sink: hit.file ? `${hit.sink} @ ${hit.file}` : hit.sink,
        source: 'code' as const
      }))
    );
  }

  private async locateHookSinks(targetUrl: string | undefined, notes: string[]): Promise<SinkEntry[]> {
    try {
      const page = await this.deps.browserSession.getSelectedPage();
      const hookData = await this.deps.hookManager.getHookData(page);
      const output: SinkEntry[] = [];

      for (const [hookId, records] of Object.entries(hookData.records)) {
        for (const record of records) {
          const entry = toRecord(record) ?? {};
          const rawUrl = typeof entry.url === 'string' ? entry.url : undefined;
          if (rawUrl && !targetMatches(rawUrl, targetUrl)) {
            continue;
          }

          const rawType = typeof entry.type === 'string' ? entry.type : '';
          const target = typeof entry.target === 'string' ? entry.target : '';
          const method = typeof entry.method === 'string' ? entry.method.toUpperCase() : 'UNKNOWN';
          const sink = this.normalizeHookSink(hookId, rawType || target);
          if (!sink) {
            continue;
          }

          output.push({
            candidateFunctions: [],
            reasons: [
              `hook record from ${hookId}`,
              rawUrl ? `captured ${method} ${normalizeUrlPattern(rawUrl)}` : 'hook record did not include URL'
            ],
            relatedUrls: rawUrl ? [rawUrl] : [],
            score: clampScore(62 + (rawUrl ? 8 : 0)),
            sink,
            source: 'hook'
          });
        }
      }

      return output;
    } catch (error) {
      notes.push(`Unable to read hook sink evidence: ${this.toMessage(error)}`);
      return [];
    }
  }

  private async locateNetworkInitiatorSinks(targetUrl: string | undefined, notes: string[]): Promise<SinkEntry[]> {
    try {
      const snapshot = await this.deps.networkCollector.listRequests({ limit: 120 });
      const output: SinkEntry[] = [];

      for (const request of snapshot.requests.filter((item) => targetMatches(item.url, targetUrl)).slice(-30)) {
        let sink = 'network request';
        const reasons = [`observed network request ${requestPatternLabel(request)}`];

        try {
          const initiator = await this.deps.networkCollector.getRequestInitiator(request.id);
          if (initiator.initiator) {
            sink = initiator.initiator.type;
            reasons.push(`matched initiator ${initiator.matchedBy ?? 'unknown'}`);
          }
        } catch {
          // Best-effort enrichment only.
        }

        output.push({
          candidateFunctions: [],
          reasons,
          relatedUrls: [request.url],
          score: sink === 'network request' ? 46 : 68,
          sink,
          source: 'network'
        });
      }

      return output;
    } catch (error) {
      notes.push(`Unable to read network initiator sink evidence: ${this.toMessage(error)}`);
      return [];
    }
  }

  private async locateCorrelationSinks(targetUrl: string | undefined, notes: string[]): Promise<SinkEntry[]> {
    try {
      const page = await this.deps.browserSession.getSelectedPage();
      const correlation = await this.deps.requestChainCorrelator.correlate(page, {
        maxFlows: 20
      });
      const output: SinkEntry[] = [];

      for (const flow of correlation.correlatedFlows.filter((item) => targetMatches(item.url, targetUrl))) {
        for (const initiator of flow.sampleInitiators) {
          output.push({
            candidateFunctions: [],
            reasons: [
              `correlated flow ${flow.method} ${flow.urlPattern}`,
              `matched initiator from ${initiator.type}`,
              flow.signatureIndicators.length > 0 ? `signature indicators: ${flow.signatureIndicators.join(', ')}` : ''
            ].filter(Boolean),
            relatedUrls: [flow.url],
            score: clampScore(64 + flow.signatureIndicators.length * 6 + flow.matchedInitiators * 4),
            sink: initiator.type,
            source: 'network'
          });
        }
      }

      return output;
    } catch (error) {
      notes.push(`Unable to read correlation sink evidence: ${this.toMessage(error)}`);
      return [];
    }
  }

  private mergeSinks(sinks: readonly SinkEntry[]): SinkEntry[] {
    const bySink = new Map<string, SinkEntry>();

    for (const sink of sinks) {
      const key = sink.sink;
      const existing = bySink.get(key);
      if (!existing) {
        bySink.set(key, {
          ...sink,
          candidateFunctions: uniqueStrings(sink.candidateFunctions, 12),
          reasons: uniqueStrings(sink.reasons, 12),
          relatedUrls: uniqueStrings(sink.relatedUrls, 12)
        });
        continue;
      }

      bySink.set(key, {
        candidateFunctions: uniqueStrings([...existing.candidateFunctions, ...sink.candidateFunctions], 12),
        reasons: uniqueStrings([...existing.reasons, ...sink.reasons], 12),
        relatedUrls: uniqueStrings([...existing.relatedUrls, ...sink.relatedUrls], 12),
        score: clampScore(Math.max(existing.score, sink.score) + 4),
        sink: existing.sink,
        source: existing.source === 'code' ? existing.source : sink.source
      });
    }

    return dedupeBy(Array.from(bySink.values()), (sink) => `${sink.source}:${sink.sink}`);
  }

  private normalizeHookSink(hookId: string, target: string): string | null {
    const text = `${hookId} ${target}`.toLowerCase();
    if (text.includes('fetch')) {
      return 'fetch';
    }
    if (text.includes('xhr') || text.includes('xmlhttprequest')) {
      return 'XMLHttpRequest';
    }
    return null;
  }

  private toMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
