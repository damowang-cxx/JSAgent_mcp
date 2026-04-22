import type { AcceptanceStatus } from '../patch/types.js';
import type { PurePreflightContext } from '../pure-preflight/types.js';

export type PureSource = 'patch-last' | 'analyze-target-last' | 'current-page';
export type PureExtractionSource = PureSource | 'pure-preflight-last' | 'task-artifact';

export interface PurePreflightUsageSummary {
  contextId: string;
  source: string;
  usedBoundaryFixture?: PurePreflightContext['usedBoundaryFixture'];
  usedCompareAnchor?: PurePreflightContext['usedCompareAnchor'];
  usedPatchPreflight?: PurePreflightContext['usedPatchPreflight'];
  usedRebuildContext?: PurePreflightContext['usedRebuildContext'];
  usedFlowReasoning?: PurePreflightContext['usedFlowReasoning'];
}

export interface FrozenRuntimeSample {
  taskId?: string | null;
  createdAt: string;
  source: PureSource;
  page: {
    url: string;
    title?: string;
  };
  requestSample?: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    postData?: string | null;
  } | null;
  hookSamples: Array<{
    hookId: string;
    target?: string;
    record: Record<string, unknown>;
  }>;
  acceptance?: {
    status: AcceptanceStatus;
    recordedAt: string;
  } | null;
  notes: string[];
}

export interface RuntimeTraceRecord {
  traceId: string;
  kind: 'call' | 'return' | 'error' | 'intermediate';
  target: string;
  timestamp: string;
  value?: unknown;
  meta?: Record<string, unknown>;
}

export interface RuntimeTraceExport {
  createdAt: string;
  sourceBundleDir: string;
  targetFunctionName?: string | null;
  records: RuntimeTraceRecord[];
  warnings: string[];
}

export interface PureBoundary {
  createdAt: string;
  explicitInputs: string[];
  derivedInputs: string[];
  environmentState: string[];
  intermediates: string[];
  outputs: string[];
  excludedRuntimeNoise: string[];
  notes: string[];
}

export interface PureFixture {
  createdAt: string;
  boundary: PureBoundary;
  input: Record<string, unknown>;
  derived?: Record<string, unknown>;
  context?: {
    environmentState?: Record<string, unknown>;
  };
  intermediates?: Record<string, unknown>;
  expectedOutput: unknown;
  source: {
    taskId?: string | null;
    sampleType: string;
  };
  evidence?: {
    pageUrl?: string;
    requestSample?: {
      url: string;
      method: string;
      hasPostData: boolean;
      headerKeys: string[];
    } | null;
    hookSampleCount: number;
    traceRecordCount: number;
  };
  notes: string[];
}

export interface NodePureScaffold {
  createdAt: string;
  taskId?: string | null;
  outputDir: string;
  entryFile: string;
  fixtureFile: string;
  files: string[];
  notes: string[];
}

export interface PureDivergence {
  kind: 'input-mismatch' | 'intermediate-mismatch' | 'output-mismatch' | 'runtime-error' | 'pure-error' | 'no-output';
  path: string;
  message: string;
  expected?: unknown;
  actual?: unknown;
}

export interface PureVerificationResult {
  verifiedAt: string;
  ok: boolean;
  runtimeOutput?: unknown;
  pureOutput?: unknown;
  divergence?: PureDivergence | null;
  notes: string[];
}

export interface PureExtractionResult {
  task?: {
    taskId: string;
    taskDir: string;
  } | null;
  frozenSample: FrozenRuntimeSample;
  runtimeTrace?: RuntimeTraceExport | null;
  boundary: PureBoundary;
  fixture: PureFixture;
  nodePure: NodePureScaffold;
  verification: PureVerificationResult;
  readyForPort: boolean;
  purePreflightUsed?: PurePreflightUsageSummary | null;
  expectedOutputsSource?: string;
  preservedInputsSource?: string;
  excludedNoiseSource?: string;
  nextActions: string[];
  whyTheseSteps: string[];
  stopIf: string[];
}
