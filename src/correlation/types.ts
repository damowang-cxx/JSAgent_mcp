import type { NetworkRequestRecord, RequestInitiatorRecord } from '../network/types.js';

export interface CorrelationOptions {
  correlationWindowMs?: number;
  maxFlows?: number;
  maxFingerprints?: number;
  candidateFunctions?: string[];
  cryptoAlgorithms?: string[];
  requestSinks?: string[];
}

export interface HookTimelineEntry {
  hookId: string;
  target: string;
  url?: string;
  event?: string;
  method?: string;
  status?: number;
  timestamp: number;
  timestampIso: string;
  signatureIndicators: string[];
  source: 'hook' | 'network';
  networkRequestId?: string;
  raw?: Record<string, unknown>;
}

export interface CorrelatedFlow {
  url: string;
  urlPattern: string;
  method: string;
  firstTimestamp: number;
  lastTimestamp: number;
  eventCount: number;
  hookIds: string[];
  events: string[];
  statuses: number[];
  signatureIndicators: string[];
  networkRequestIds: string[];
  matchedInitiators: number;
  sampleInitiators: RequestInitiatorRecord[];
}

export interface RequestFingerprint {
  fingerprint: string;
  urlPattern: string;
  methods: string[];
  flowCount: number;
  totalEvents: number;
  signatureIndicators: string[];
  suspiciousScore: number;
  sampleUrls: string[];
  matchedInitiators: number;
}

export interface CorrelationPriorityTarget {
  target: string;
  type: 'network' | 'function' | 'crypto';
  priorityScore: number;
  reasons: string[];
}

export interface CorrelationResult {
  timeline: HookTimelineEntry[];
  correlatedFlows: CorrelatedFlow[];
  suspiciousFlows: CorrelatedFlow[];
  requestFingerprints: RequestFingerprint[];
  priorityTargets: CorrelationPriorityTarget[];
  networkRequests: NetworkRequestRecord[];
  warnings?: string[];
}
