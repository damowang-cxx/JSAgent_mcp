import type { Page } from 'puppeteer';

import type { HookManager } from '../hook/HookManager.js';
import type { NetworkCollector } from '../network/NetworkCollector.js';
import type { NetworkRequestRecord, RequestInitiatorRecord } from '../network/types.js';
import { buildPriorityTargets, buildRequestFingerprints, isSuspiciousUrlOrMethod, normalizeUrlPattern } from './fingerprinting.js';
import { buildHookTimeline, networkRecordsToTimeline } from './timeline.js';
import type { CorrelatedFlow, CorrelationOptions, CorrelationResult, HookTimelineEntry } from './types.js';

const DEFAULT_CORRELATION_WINDOW_MS = 1_500;
const DEFAULT_MAX_FLOWS = 20;
const DEFAULT_MAX_FINGERPRINTS = 12;

export class RequestChainCorrelator {
  constructor(
    private readonly deps: {
      hookManager: HookManager;
      networkCollector: NetworkCollector;
    }
  ) {}

  async correlate(page: Page, options: CorrelationOptions = {}): Promise<CorrelationResult> {
    const warnings = [
      'Correlation is approximate and based on timestamp, URL pattern, method, hook records, network records, and initiator matching.'
    ];
    const correlationWindowMs = options.correlationWindowMs ?? DEFAULT_CORRELATION_WINDOW_MS;
    const maxFlows = options.maxFlows ?? DEFAULT_MAX_FLOWS;
    const maxFingerprints = options.maxFingerprints ?? DEFAULT_MAX_FINGERPRINTS;
    const [hookTimeline, networkRequests] = await Promise.all([
      this.readHookTimeline(page, warnings),
      this.readNetworkRequests(warnings)
    ]);
    const timeline = [...hookTimeline, ...networkRecordsToTimeline(networkRequests)].sort((left, right) => left.timestamp - right.timestamp);
    const correlatedFlows = await this.correlateNetworkFlows(timeline, networkRequests, correlationWindowMs, maxFlows);
    const suspiciousFlows = correlatedFlows.filter((flow) =>
      flow.signatureIndicators.length > 0 || isSuspiciousUrlOrMethod(flow.url, [flow.method])
    );
    const requestFingerprints = buildRequestFingerprints(correlatedFlows, maxFingerprints);
    const priorityTargets = buildPriorityTargets({
      candidateFunctions: options.candidateFunctions,
      cryptoAlgorithms: options.cryptoAlgorithms,
      requestFingerprints,
      requestSinks: options.requestSinks
    });

    return {
      correlatedFlows,
      networkRequests,
      priorityTargets,
      requestFingerprints,
      suspiciousFlows,
      timeline: timeline.slice(-200),
      warnings
    };
  }

  private async readHookTimeline(page: Page, warnings: string[]): Promise<HookTimelineEntry[]> {
    try {
      const hookData = await this.deps.hookManager.getHookData(page);
      return buildHookTimeline(hookData);
    } catch (error) {
      warnings.push(`Unable to read hook data: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  private async readNetworkRequests(warnings: string[]): Promise<NetworkRequestRecord[]> {
    try {
      const result = await this.deps.networkCollector.listRequests({ limit: 300 });
      return result.requests;
    } catch (error) {
      warnings.push(`Unable to read network records: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  private async correlateNetworkFlows(
    timeline: readonly HookTimelineEntry[],
    networkRequests: readonly NetworkRequestRecord[],
    correlationWindowMs: number,
    maxFlows: number
  ): Promise<CorrelatedFlow[]> {
    const buckets: Array<{
      url: string;
      urlPattern: string;
      method: string;
      firstTimestamp: number;
      lastTimestamp: number;
      eventCount: number;
      hookIds: Set<string>;
      events: Set<string>;
      statuses: Set<number>;
      signatureIndicators: Set<string>;
      networkRequestIds: Set<string>;
    }> = [];

    for (const item of timeline) {
      if (!item.url) {
        continue;
      }

      const method = item.method ?? 'UNKNOWN';
      const urlPattern = normalizeUrlPattern(item.url);
      const existing = buckets.find(
        (bucket) => bucket.method === method && bucket.urlPattern === urlPattern && item.timestamp - bucket.lastTimestamp <= correlationWindowMs
      );

      if (existing) {
        existing.lastTimestamp = item.timestamp;
        existing.eventCount += 1;
        existing.hookIds.add(item.hookId);
        existing.events.add(item.event ?? item.target);
        if (typeof item.status === 'number') {
          existing.statuses.add(item.status);
        }
        if (item.networkRequestId) {
          existing.networkRequestIds.add(item.networkRequestId);
        }
        for (const indicator of item.signatureIndicators) {
          existing.signatureIndicators.add(indicator);
        }
        continue;
      }

      buckets.push({
        eventCount: 1,
        events: new Set([item.event ?? item.target]),
        firstTimestamp: item.timestamp,
        hookIds: new Set([item.hookId]),
        lastTimestamp: item.timestamp,
        method,
        networkRequestIds: new Set(item.networkRequestId ? [item.networkRequestId] : []),
        signatureIndicators: new Set(item.signatureIndicators),
        statuses: typeof item.status === 'number' ? new Set([item.status]) : new Set(),
        url: item.url,
        urlPattern
      });
    }

    for (const request of networkRequests) {
      const method = request.method.toUpperCase();
      const urlPattern = normalizeUrlPattern(request.url);
      const timestamp = Date.parse(request.startedAt);
      if (Number.isNaN(timestamp)) {
        continue;
      }

      const existing = buckets.find(
        (bucket) => bucket.method === method && bucket.urlPattern === urlPattern && Math.abs(timestamp - bucket.lastTimestamp) <= correlationWindowMs
      );
      if (existing) {
        existing.networkRequestIds.add(request.id);
      }
    }

    const flows = buckets
      .sort((left, right) => right.eventCount - left.eventCount || right.lastTimestamp - left.lastTimestamp)
      .slice(0, maxFlows);

    return Promise.all(
      flows.map(async (bucket) => {
        const initiators = await this.sampleInitiators(Array.from(bucket.networkRequestIds), correlationWindowMs);
        return {
          eventCount: bucket.eventCount,
          events: Array.from(bucket.events).sort(),
          firstTimestamp: bucket.firstTimestamp,
          hookIds: Array.from(bucket.hookIds).filter((hookId) => hookId !== 'network').sort(),
          lastTimestamp: bucket.lastTimestamp,
          matchedInitiators: initiators.length,
          method: bucket.method,
          networkRequestIds: Array.from(bucket.networkRequestIds),
          sampleInitiators: initiators,
          signatureIndicators: Array.from(bucket.signatureIndicators).sort(),
          statuses: Array.from(bucket.statuses).sort((left, right) => left - right),
          url: bucket.url,
          urlPattern: bucket.urlPattern
        };
      })
    );
  }

  private async sampleInitiators(
    requestIds: readonly string[],
    timeWindowMs: number
  ): Promise<RequestInitiatorRecord[]> {
    const initiators: RequestInitiatorRecord[] = [];

    for (const requestId of requestIds.slice(0, 5)) {
      try {
        const match = await this.deps.networkCollector.getRequestInitiator(requestId, timeWindowMs);
        if (match.initiator) {
          initiators.push(match.initiator);
        }
      } catch {
        // Best-effort enrichment only.
      }
    }

    return initiators;
  }
}
