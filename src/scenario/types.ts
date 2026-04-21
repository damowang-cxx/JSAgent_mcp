export type ScenarioType = 'api-signature' | 'token-family' | 'anti-bot' | 'crypto-helper';

export type ScenarioIndicatorType =
  | 'param'
  | 'function'
  | 'url'
  | 'header'
  | 'body-field'
  | 'crypto'
  | 'sink';

export interface ScenarioIndicator {
  type: ScenarioIndicatorType;
  value: string;
  confidence: number;
  reason: string;
}

export type PriorityTargetKind = 'request' | 'function' | 'helper' | 'param' | 'sink';

export interface PriorityTarget {
  target: string;
  kind: PriorityTargetKind;
  score: number;
  reasons: string[];
}

export interface ScenarioAction {
  step: string;
  purpose: string;
  stopIf?: string;
}

export interface SuspiciousRequest {
  url: string;
  method: string;
  score: number;
  indicators: string[];
}

export interface ScenarioAnalysisResult {
  scenario: ScenarioType;
  targetUrl?: string;
  indicators: ScenarioIndicator[];
  candidateFunctions: string[];
  requestSinks: string[];
  suspiciousRequests: SuspiciousRequest[];
  priorityTargets: PriorityTarget[];
  nextActions: ScenarioAction[];
  whyTheseTargets: string[];
  stopIf: string[];
  notes: string[];
}

export interface TokenFamilyTraceResult {
  familyName: string;
  members: Array<{
    name: string;
    source: 'request' | 'hook' | 'code' | 'trace';
    confidence: number;
    firstSeen?: string;
  }>;
  transformations: Array<{
    from: string;
    to: string;
    via?: string;
    confidence: number;
  }>;
  requestBindings: Array<{
    url: string;
    param: string;
    method: string;
  }>;
  notes: string[];
}

export interface RequestSinkResult {
  sinks: Array<{
    sink: string;
    source: 'code' | 'hook' | 'network';
    score: number;
    relatedUrls: string[];
    candidateFunctions: string[];
    reasons: string[];
  }>;
  topSink?: string | null;
  notes: string[];
}

export type CryptoHelperKind = 'hash' | 'hmac' | 'aes' | 'rsa' | 'base64' | 'encode' | 'unknown';

export interface CryptoHelperResult {
  helpers: Array<{
    name: string;
    file?: string;
    kind: CryptoHelperKind;
    confidence: number;
    reasons: string[];
  }>;
  libraries: string[];
  notes: string[];
}

export interface ScenarioPreset {
  presetId: string;
  scenario: ScenarioType;
  description: string;
  hookTypes: string[];
  collectHints: {
    topN?: number;
    includeDynamic?: boolean;
  };
  replayHints?: string[];
  notes?: string[];
}

export interface ScenarioWorkflowResult {
  preset: ScenarioPreset;
  analysis: ScenarioAnalysisResult;
  task?: { taskId: string; taskDir: string } | null;
  evidenceWritten: boolean;
  nextActions: string[];
  whyTheseSteps: string[];
  stopIf: string[];
  tokenTrace?: TokenFamilyTraceResult | null;
  sinkResult?: RequestSinkResult | null;
  helperResult?: CryptoHelperResult | null;
}
