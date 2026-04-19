export type CodeFileType = 'inline' | 'external';

export interface CollectCodeOptions {
  url?: string;
  includeInline?: boolean;
  includeExternal?: boolean;
  maxFileSize?: number;
  maxTotalSize?: number;
  timeout?: number;
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
