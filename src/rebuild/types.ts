import type { CodeFileSummary } from '../collector/types.js';

export interface RebuildBundleOptions {
  taskId?: string;
  entryStrategy?: 'single-file' | 'top-priority-merged';
  sourceUrl?: string;
  topFileUrl?: string;
  topN?: number;
  includeFixture?: boolean;
  includeEnvShim?: boolean;
  includeAccessLogger?: boolean;
  targetFunctionName?: string;
  overwrite?: boolean;
}

export interface RebuildBundleExport {
  taskId?: string | null;
  bundleDir: string;
  entryFile: string;
  targetFiles: string[];
  fixtureFile?: string | null;
  metadataFile: string;
  warnings: string[];
}

export interface RebuildRunOptions {
  bundleDir: string;
  timeoutMs?: number;
  envOverrides?: Record<string, unknown>;
  fixturePath?: string;
  entryFile?: string;
}

export interface RebuildRunResult {
  ok: boolean;
  exitCode: number | null;
  signal: string | null;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  stdout: string;
  stderr: string;
  parsedResult?: unknown;
  parsedError?: unknown;
  envAccessSummary?: {
    total: number;
    byType: Record<string, number>;
  };
  envAccessLog?: unknown[];
  warnings?: string[];
}

export interface RuntimeFixture {
  createdAt: string;
  source: 'hook' | 'network' | 'manual' | 'analyze-target';
  page: {
    url: string;
    title?: string;
  };
  requestSamples: Array<{
    url: string;
    method: string;
    postData?: string | null;
    headers?: Record<string, string>;
  }>;
  hookSamples: Array<{
    hookId: string;
    target?: string;
    record: Record<string, unknown>;
  }>;
  selectedPriorityTargets?: string[];
  selectedCodeFiles?: CodeFileSummary[];
  notes?: string[];
}

export interface DivergenceRecord {
  kind: 'missing-global' | 'missing-property' | 'type-mismatch' | 'value-mismatch' | 'runtime-error' | 'no-output';
  path: string;
  expected?: unknown;
  actual?: unknown;
  message: string;
  severity: 'low' | 'medium' | 'high';
}

export interface DivergenceComparisonResult {
  matched: boolean;
  divergence?: DivergenceRecord | null;
  comparedAt: string;
  notes: string[];
}

export interface PatchSuggestion {
  target: string;
  patchType: 'shim' | 'polyfill' | 'value-seed' | 'defer-and-observe';
  reason: string;
  suggestedCode?: string;
  confidence: number;
  basedOn: string[];
}

export interface RebuildWorkflowOptions {
  url?: string;
  taskId?: string;
  taskSlug?: string;
  targetUrl?: string;
  goal?: string;
  export?: RebuildBundleOptions;
  run?: {
    timeoutMs?: number;
    envOverrides?: Record<string, unknown>;
  };
  fixtureSource?: 'current-page' | 'analyze-target-last';
  writeEvidence?: boolean;
}

export interface RebuildWorkflowResult {
  task?: {
    taskId: string;
    taskDir: string;
  } | null;
  bundle: RebuildBundleExport;
  fixture?: RuntimeFixture | null;
  run: RebuildRunResult;
  comparison: DivergenceComparisonResult;
  patch: {
    suggestions: PatchSuggestion[];
    firstSuggestion?: PatchSuggestion | null;
  };
  nextActions: string[];
  whyTheseSteps: string[];
  stopIf: string[];
}
