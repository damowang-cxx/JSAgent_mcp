export interface NetworkRequestRecord {
  id: string;
  url: string;
  method: string;
  resourceType: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  status?: number;
  ok?: boolean;
  failed?: boolean;
  failureText?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  postData?: string | null;
  frameUrl?: string | null;
}

export interface ListNetworkRequestsOptions {
  limit?: number;
  urlPattern?: string;
  method?: string;
  resourceType?: string;
}

export interface RequestInitiatorRecord {
  initiatorId: string;
  type: 'fetch' | 'xhr';
  url: string;
  method: string;
  timestamp: string;
  stack?: string;
  pageUrl?: string;
  inputSummary?: unknown;
  bodySummary?: unknown;
}

export interface RequestInitiatorMatchResult {
  requestId: string;
  initiator: RequestInitiatorRecord | null;
  matchedBy?: string;
}

export type XhrWatchMode = 'record' | 'debugger-statement';

export interface XhrWatchRule {
  id: string;
  pattern: string;
  isRegex?: boolean;
  methods?: string[];
  enabled: boolean;
  createdAt: string;
  mode: XhrWatchMode;
}

export interface XhrWatchEvent {
  eventId: string;
  ruleId: string;
  pattern: string;
  matchedAt: string;
  mode: XhrWatchMode;
  url: string;
  method: string;
  type: 'fetch' | 'xhr';
  initiatorId: string;
  pageUrl?: string;
}
