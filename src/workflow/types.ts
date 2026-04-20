import type { AnalyzeTargetResult } from '../analysis/types.js';
import type { CollectedCodeSummaryResult, TopPriorityCollectedCodeResult } from '../collector/types.js';

export interface ProbeReverseCollectOptions {
  returnMode?: 'summary' | 'top-priority';
  topN?: number;
  includeInline?: boolean;
  includeExternal?: boolean;
  includeDynamic?: boolean;
  dynamicWaitMs?: number;
}

export interface ProbeReverseTargetOptions {
  url?: string;
  taskId?: string;
  taskSlug?: string;
  targetUrl?: string;
  goal?: string;
  collect?: ProbeReverseCollectOptions;
  autoInjectHooks?: boolean;
  hookTypes?: Array<'fetch' | 'xhr'>;
  waitAfterSetupMs?: number;
  writeEvidence?: boolean;
}

export interface ProbeReverseTargetResult {
  page: {
    url: string;
    title: string;
  };
  collectedCode?: CollectedCodeSummaryResult | TopPriorityCollectedCodeResult;
  hooksInjected?: string[];
  networkObserverAttached: true;
  initiatorTrackerAttached: true;
  task: {
    taskId: string;
    taskDir: string;
  } | null;
  nextActions: string[];
}

export interface AnalyzeTargetCollectOptions {
  includeInline?: boolean;
  includeExternal?: boolean;
  includeDynamic?: boolean;
  dynamicWaitMs?: number;
  maxTotalSize?: number;
  maxFileSize?: number;
}

export interface AnalyzeTargetOptions {
  url: string;
  topN?: number;
  hookPreset?: 'none' | 'api-signature' | 'network-core';
  autoInjectHooks?: boolean;
  waitAfterHookMs?: number;
  maxFingerprints?: number;
  collect?: AnalyzeTargetCollectOptions;
  taskId?: string;
  taskSlug?: string;
  targetUrl?: string;
  goal?: string;
  writeEvidence?: boolean;
}

export type { AnalyzeTargetResult };
