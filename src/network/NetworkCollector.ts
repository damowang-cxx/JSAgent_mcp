import type { HTTPRequest, HTTPResponse, Page } from 'puppeteer';

import { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import { AppError } from '../core/errors.js';
import { RequestInitiatorTracker } from './RequestInitiatorTracker.js';
import type {
  ListNetworkRequestsOptions,
  NetworkRequestRecord,
  RequestInitiatorMatchResult,
  RequestInitiatorRecord
} from './types.js';

const DEFAULT_MAX_REQUESTS_PER_PAGE = 500;
const MAX_POST_DATA_LENGTH = 8_000;

interface PageNetworkState {
  page: Page;
  pageId: string;
  records: NetworkRequestRecord[];
  requestIndex: Map<string, NetworkRequestRecord>;
  requestSequence: number;
  requestToId: WeakMap<HTTPRequest, string>;
}

export class NetworkCollector {
  private readonly pageStates = new Map<string, PageNetworkState>();

  constructor(
    private readonly browserSession: BrowserSessionManager,
    private readonly requestInitiatorTracker: RequestInitiatorTracker,
    private readonly maxRequestsPerPage = DEFAULT_MAX_REQUESTS_PER_PAGE
  ) {}

  async ensureAttachedToSelectedPage(): Promise<void> {
    const page = await this.browserSession.getSelectedPage();
    this.ensurePageAttached(page);
  }

  async listRequests(options: ListNetworkRequestsOptions = {}): Promise<{ total: number; requests: NetworkRequestRecord[] }> {
    const page = await this.browserSession.getSelectedPage();
    const state = this.ensurePageAttached(page);
    const filtered = this.filterRecords(state.records, options);
    const limit = options.limit === undefined ? filtered.length : Math.max(1, options.limit);

    return {
      requests: filtered.slice(Math.max(0, filtered.length - limit)),
      total: filtered.length
    };
  }

  async getRequest(id: string): Promise<NetworkRequestRecord | null> {
    const locatedRequest = this.findRequest(id);
    if (!locatedRequest) {
      return null;
    }

    return {
      ...locatedRequest.record
    };
  }

  async getRequestInitiator(requestId: string, timeWindowMs = 2_000): Promise<RequestInitiatorMatchResult> {
    const locatedRequest = this.findRequest(requestId);
    if (!locatedRequest) {
      return {
        initiator: null,
        requestId
      };
    }

    const history = await this.requestInitiatorTracker.getInitiatorHistory(locatedRequest.state.page);
    const exactMatch = this.findNearestInitiator(locatedRequest.record, history, timeWindowMs, true);
    if (exactMatch) {
      return {
        initiator: exactMatch,
        matchedBy: 'method+url+nearest-timestamp',
        requestId
      };
    }

    const urlMatch = this.findNearestInitiator(locatedRequest.record, history, timeWindowMs, false);
    if (urlMatch) {
      return {
        initiator: urlMatch,
        matchedBy: 'url+nearest-timestamp',
        requestId
      };
    }

    return {
      initiator: null,
      requestId
    };
  }

  async clearSelectedPageRequests(): Promise<{ cleared: number }> {
    const page = await this.browserSession.getSelectedPage();
    const state = this.ensurePageAttached(page);
    const cleared = state.records.length;

    state.records.length = 0;
    state.requestIndex.clear();
    state.requestToId = new WeakMap();
    state.requestSequence = 0;

    return { cleared };
  }

  clearAll(): void {
    for (const state of this.pageStates.values()) {
      state.records.length = 0;
      state.requestIndex.clear();
      state.requestToId = new WeakMap();
      state.requestSequence = 0;
    }
  }

  private ensurePageAttached(page: Page): PageNetworkState {
    const pageId = this.browserSession.getPageId(page);
    const existing = this.pageStates.get(pageId);
    if (existing) {
      return existing;
    }

    const state: PageNetworkState = {
      page,
      pageId,
      records: [],
      requestIndex: new Map<string, NetworkRequestRecord>(),
      requestSequence: 0,
      requestToId: new WeakMap<HTTPRequest, string>()
    };

    page.on('request', (request) => {
      this.onRequest(state, request);
    });

    page.on('response', (response) => {
      this.onResponse(state, response);
    });

    page.on('requestfinished', (request) => {
      this.onRequestFinished(state, request);
    });

    page.on('requestfailed', (request) => {
      this.onRequestFailed(state, request);
    });

    page.once('close', () => {
      this.pageStates.delete(pageId);
    });

    this.pageStates.set(pageId, state);
    return state;
  }

  private findRequest(id: string): { state: PageNetworkState; record: NetworkRequestRecord } | null {
    for (const state of this.pageStates.values()) {
      const record = state.requestIndex.get(id);
      if (record) {
        return {
          record,
          state
        };
      }
    }

    return null;
  }

  private onRequest(state: PageNetworkState, request: HTTPRequest): void {
    const id = `${state.pageId}:${state.requestSequence++}`;
    const record: NetworkRequestRecord = {
      frameUrl: request.frame()?.url() ?? null,
      id,
      method: request.method(),
      postData: this.normalizePostData(request.postData()),
      requestHeaders: request.headers(),
      resourceType: request.resourceType(),
      startedAt: new Date().toISOString(),
      url: request.url()
    };

    state.records.push(record);
    state.requestIndex.set(id, record);
    state.requestToId.set(request, id);

    if (state.records.length > this.maxRequestsPerPage) {
      const removed = state.records.shift();
      if (removed) {
        state.requestIndex.delete(removed.id);
      }
    }
  }

  private onResponse(state: PageNetworkState, response: HTTPResponse): void {
    const request = response.request();
    const record = this.getRecordForRequest(state, request);
    if (!record) {
      return;
    }

    record.ok = response.ok();
    record.responseHeaders = response.headers();
    record.status = response.status();
  }

  private onRequestFinished(state: PageNetworkState, request: HTTPRequest): void {
    const record = this.getRecordForRequest(state, request);
    if (!record) {
      return;
    }

    const endedAt = new Date().toISOString();
    record.endedAt = endedAt;
    record.durationMs = this.calculateDurationMs(record.startedAt, endedAt);
  }

  private onRequestFailed(state: PageNetworkState, request: HTTPRequest): void {
    const record = this.getRecordForRequest(state, request);
    if (!record) {
      return;
    }

    const endedAt = new Date().toISOString();
    record.endedAt = endedAt;
    record.durationMs = this.calculateDurationMs(record.startedAt, endedAt);
    record.failed = true;
    record.failureText = request.failure()?.errorText ?? 'requestfailed';
  }

  private getRecordForRequest(state: PageNetworkState, request: HTTPRequest): NetworkRequestRecord | undefined {
    const id = state.requestToId.get(request);
    if (!id) {
      return undefined;
    }

    return state.requestIndex.get(id);
  }

  private filterRecords(records: readonly NetworkRequestRecord[], options: ListNetworkRequestsOptions): NetworkRequestRecord[] {
    let urlExpression: RegExp | null = null;

    if (options.urlPattern) {
      try {
        urlExpression = new RegExp(options.urlPattern, 'i');
      } catch (error) {
        throw new AppError('INVALID_URL_PATTERN', `Invalid urlPattern regular expression: ${error instanceof Error ? error.message : String(error)}`, {
          urlPattern: options.urlPattern
        });
      }
    }

    return records
      .filter((record) => {
        if (urlExpression && !urlExpression.test(record.url)) {
          return false;
        }

        if (options.method && record.method.toUpperCase() !== options.method.toUpperCase()) {
          return false;
        }

        if (options.resourceType && record.resourceType !== options.resourceType) {
          return false;
        }

        return true;
      })
      .map((record) => ({
        ...record
      }));
  }

  private calculateDurationMs(startedAt: string, endedAt: string): number | undefined {
    const started = Date.parse(startedAt);
    const ended = Date.parse(endedAt);

    if (Number.isNaN(started) || Number.isNaN(ended)) {
      return undefined;
    }

    return Math.max(0, ended - started);
  }

  private findNearestInitiator(
    request: NetworkRequestRecord,
    history: readonly RequestInitiatorRecord[],
    timeWindowMs: number,
    requireMethodMatch: boolean
  ): RequestInitiatorRecord | null {
    const requestStartedAt = Date.parse(request.startedAt);
    if (Number.isNaN(requestStartedAt)) {
      return null;
    }

    const requestMethod = request.method.toUpperCase();
    const requestUrl = this.normalizeComparableUrl(request.url);
    let bestMatch: RequestInitiatorRecord | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const candidate of history) {
      if (this.normalizeComparableUrl(candidate.url) !== requestUrl) {
        continue;
      }

      if (requireMethodMatch && candidate.method.toUpperCase() !== requestMethod) {
        continue;
      }

      const candidateStartedAt = Date.parse(candidate.timestamp);
      if (Number.isNaN(candidateStartedAt)) {
        continue;
      }

      const distance = Math.abs(requestStartedAt - candidateStartedAt);
      if (distance > timeWindowMs) {
        continue;
      }

      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatch = {
          ...candidate
        };
      }
    }

    return bestMatch;
  }

  private normalizePostData(postData: string | undefined): string | null {
    if (postData === undefined) {
      return null;
    }

    return postData.length > MAX_POST_DATA_LENGTH ? `${postData.slice(0, MAX_POST_DATA_LENGTH)}...[truncated]` : postData;
  }

  private normalizeComparableUrl(url: string): string {
    try {
      const normalizedUrl = new URL(url);
      normalizedUrl.hash = '';
      return normalizedUrl.toString();
    } catch {
      return url;
    }
  }
}
