import type { UpgradeDiffResult } from '../port/types.js';
import type {
  DeliveryCompareAnchorSummary,
  DeliveryFlowReasoningSummary,
  DeliveryPatchPreflightSummary,
  DeliveryPurePreflightSummary,
  DeliveryRebuildContextSummary,
  RegressionContext
} from '../delivery-consumption/types.js';

export interface RegressionBaseline {
  baselineId: string;
  taskId?: string | null;
  createdAt: string;
  source: 'pure' | 'port';
  fixtureFile: string;
  nodeEntryFile: string;
  pythonEntryFile?: string | null;
  expectedNodeOutput?: unknown;
  expectedPythonOutput?: unknown;
  contractSummary?: {
    explicitInputs: string[];
    outputs: string[];
  };
  notes: string[];
}

export interface IntermediateBaseline {
  baselineId: string;
  taskId?: string | null;
  createdAt: string;
  source: 'pure' | 'port';
  fixtureFile: string;
  explicitInputs: string[];
  outputKeys: string[];
  intermediateKeys: string[];
  expectedNodeIntermediates?: Record<string, unknown>;
  expectedPythonIntermediates?: Record<string, unknown>;
  notes: string[];
}

export interface RegressionRunResult {
  runId: string;
  baselineId: string;
  executedAt: string;
  node?: {
    ok: boolean;
    output?: unknown;
    error?: unknown;
  };
  python?: {
    ok: boolean;
    output?: unknown;
    error?: unknown;
  } | null;
  matchedBaseline: boolean;
  divergence?: {
    layer: 'node' | 'python' | 'cross-language' | 'baseline';
    message: string;
    path: string;
    expected?: unknown;
    actual?: unknown;
  } | null;
  notes: string[];
  nextActionHint: string;
  regressionContextUsed?: RegressionContext | null;
  compareAnchorUsed?: DeliveryCompareAnchorSummary | null;
  patchPreflightUsed?: DeliveryPatchPreflightSummary | null;
  rebuildContextUsed?: DeliveryRebuildContextSummary | null;
  purePreflightUsed?: DeliveryPurePreflightSummary | null;
  flowReasoningUsed?: DeliveryFlowReasoningSummary | null;
}

export interface IntermediateRegressionResult {
  runId: string;
  baselineId: string;
  executedAt: string;
  matched: boolean;
  divergence?: {
    layer: 'node-intermediate' | 'python-intermediate' | 'cross-language-intermediate' | 'final-output';
    path: string;
    message: string;
    expected?: unknown;
    actual?: unknown;
  } | null;
  nodeIntermediates?: Record<string, unknown>;
  pythonIntermediates?: Record<string, unknown>;
  notes: string[];
  nextActionHint: string;
}

export interface VersionedBaseline {
  versionId: string;
  taskId?: string | null;
  createdAt: string;
  label: string;
  basedOnBaselineId?: string | null;
  nodeOutput?: unknown;
  pythonOutput?: unknown;
  intermediates?: Record<string, unknown>;
  notes: string[];
}

export interface UpgradeWorkflowResult {
  baseline: VersionedBaseline;
  currentRegression: RegressionRunResult | null;
  intermediateRegression?: IntermediateRegressionResult | null;
  upgradeDiff: UpgradeDiffResult;
  nextActions: string[];
  whyTheseSteps: string[];
  stopIf: string[];
}
