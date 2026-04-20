import type { CodeFileSummary } from '../collector/types.js';
import type { NetworkRequestRecord } from '../network/types.js';

export type RiskSeverity = 'low' | 'medium' | 'high';
export type RiskLevel = 'low' | 'medium' | 'high';
export type CodeSummaryMode = 'single' | 'batch' | 'project';
export type StaticAnalysisFocus = 'all' | 'structure' | 'business' | 'security';

export interface CodeSummary {
  mode: CodeSummaryMode;
  overview: string;
  keywords: string[];
  fileCount?: number;
  highlights: string[];
  suspiciousIndicators?: string[];
}

export interface StaticRisk {
  type: string;
  severity: RiskSeverity;
  message: string;
}

export interface StaticAnalysisResult {
  structure: {
    fileTypeHints: string[];
    likelyModules: string[];
    exportedSymbols: string[];
    candidateFunctions: string[];
  };
  business: {
    requestRelated: boolean;
    storageRelated: boolean;
    cryptoRelated: boolean;
    domRelated: boolean;
  };
  security: {
    risks: StaticRisk[];
    dangerousApis: string[];
    suspiciousStrings: string[];
  };
  metrics: {
    lines: number;
    chars: number;
    functionCount: number;
    stringLiteralCount: number;
  };
  qualityScore: number;
}

export interface CryptoDetectionResult {
  algorithms: Array<{
    name: string;
    confidence: number;
    matchedBy: string[];
  }>;
  libraries: string[];
  securityIssues: Array<{
    type: string;
    severity: RiskSeverity;
    message: string;
  }>;
  notes?: string[];
}

export interface RiskPanelResult {
  score: number;
  level: RiskLevel;
  factors: {
    securityRisks: number;
    highSeverityRisks: number;
    cryptoAlgorithms: number;
    cryptoIssues: number;
    dangerousAlgorithms: string[];
    hookSignals: number;
    suspiciousNetworkRequests: number;
  };
  recommendations: string[];
}

export interface SessionReport {
  generatedAt: string;
  collector: {
    totalFiles: number;
    totalSize: number;
    files: CodeFileSummary[];
  };
  hooks: {
    totalHooks: number;
    enabledHooks: number;
    disabledHooks: number;
    totalRecords?: number;
    recordsByHook?: Record<string, number>;
  };
  network: {
    includedRecentRequests: boolean;
    totalObserved?: number;
    suspiciousRequests?: number;
    recentRequests?: NetworkRequestRecord[];
    warning?: string;
  };
  evidence: {
    rootDir: string;
    taskCount: number;
    tasks: Array<{
      taskId: string;
      slug?: string;
      targetUrl?: string;
      goal?: string;
      updatedAt?: string;
    }>;
    warning?: string;
  };
  riskSummary?: RiskPanelResult;
  recentRequests?: NetworkRequestRecord[];
  notes?: string[];
}

export interface RequestFingerprint {
  method: string;
  pattern: string;
  count: number;
  suspiciousScore: number;
  sampleUrls: string[];
}

export interface AnalyzeTargetStep {
  action: string;
  tool?: string;
  reason: string;
  params?: Record<string, unknown>;
}

export interface PriorityTarget {
  type: 'request' | 'function' | 'crypto' | 'hook';
  label: string;
  reason: string;
  score: number;
}

export interface AnalyzeTargetResult {
  target: {
    url: string;
    targetUrl?: string;
    goal?: string;
  };
  page: {
    url: string;
    title: string;
  };
  collection: {
    totalFiles: number;
    totalSize: number;
    topPriorityFiles: Array<CodeFileSummary & {
      score?: number;
      reasons?: string[];
    }>;
    warnings?: string[];
  };
  summaries: {
    topFiles: CodeSummary;
    project: CodeSummary;
  };
  understanding: StaticAnalysisResult;
  crypto: CryptoDetectionResult;
  risk: RiskPanelResult;
  hooks: {
    preset: 'none' | 'api-signature' | 'network-core';
    injected: string[];
    signalCount: number;
  };
  network: {
    totalObserved: number;
    suspiciousRequests: number;
    recentRequests: NetworkRequestRecord[];
  };
  requestFingerprints: RequestFingerprint[];
  priorityTargets: PriorityTarget[];
  recommendedNextSteps: AnalyzeTargetStep[];
  whyTheseSteps: string[];
  stopIf: string[];
  task?: {
    taskId: string;
    taskDir: string;
  } | null;
}
