export type CodeFileType = 'inline' | 'external';
export type CollectCodeReturnMode = 'full' | 'summary' | 'pattern' | 'top-priority';

export interface CollectCodeOptions {
  url?: string;
  includeInline?: boolean;
  includeExternal?: boolean;
  includeDynamic?: boolean;
  dynamicWaitMs?: number;
  maxFileSize?: number;
  maxTotalSize?: number;
  timeout?: number;
  returnMode?: CollectCodeReturnMode;
  pattern?: string;
  limit?: number;
  topN?: number;
}

export interface CodeFile {
  url: string;
  content: string;
  size: number;
  type: CodeFileType;
}

export interface CodeFileSummary {
  url: string;
  size: number;
  type: CodeFileType;
}

export interface RankedCodeFile extends CodeFile {
  score: number;
  reasons: string[];
}

export interface CollectCodeSkippedFile {
  url: string;
  reason: string;
  type: CodeFileType;
}

export interface CollectCodeExternalFailure {
  url: string;
  reason: string;
}

export interface CollectCodeResult {
  files: CodeFile[];
  totalFiles: number;
  totalSize: number;
  collectedAt: string;
  sourceUrl: string;
  failedExternalScripts?: CollectCodeExternalFailure[];
  skippedFiles?: CollectCodeSkippedFile[];
  warnings?: string[];
}

export interface CollectedCodeSummaryResult {
  total: number;
  files: CodeFileSummary[];
}

export interface PatternCollectedCodeResult {
  pattern: string;
  matched: number;
  returned: number;
  totalSize: number;
  truncated: boolean;
  files: CodeFile[];
}

export interface TopPriorityCollectedCodeResult {
  topN: number;
  returned: number;
  totalSize: number;
  truncated: boolean;
  files: RankedCodeFile[];
}

export interface CodeCollectionDiffEntry {
  previous: CodeFileSummary;
  current: CodeFileSummary;
}

export interface CodeCollectionDiffResult {
  added: CodeFileSummary[];
  removed: CodeFileSummary[];
  changed: CodeCollectionDiffEntry[];
  unchanged?: CodeFileSummary[];
}

export interface SearchCollectedCodeMatch {
  index: number;
  preview: string;
}

export interface SearchCollectedCodeResult {
  pattern: string;
  matched: number;
  results: Array<{
    url: string;
    matches: SearchCollectedCodeMatch[];
  }>;
}
