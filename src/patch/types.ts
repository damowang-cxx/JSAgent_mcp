import type { DivergenceComparisonResult, DivergenceRecord, PatchSuggestion, RebuildBundleExport, RebuildRunResult, RuntimeFixture } from '../rebuild/types.js';

export type PatchPlanStatus = 'open' | 'applied' | 'superseded' | 'accepted' | 'abandoned';
export type AppliedPatchStatus = 'applied' | 'reverted' | 'superseded';
export type AcceptanceStatus = 'passed' | 'failed' | 'partial';

export interface PatchPlan {
  planId: string;
  taskId?: string | null;
  createdAt: string;
  basedOnDivergence: DivergenceRecord | null;
  suggestions: PatchSuggestion[];
  selectedSuggestion?: PatchSuggestion | null;
  status: PatchPlanStatus;
  notes?: string[];
}

export interface AppliedPatchRecord {
  patchId: string;
  planId?: string | null;
  taskId?: string | null;
  appliedAt: string;
  target: string;
  patchType: PatchSuggestion['patchType'];
  suggestedCode?: string;
  status: AppliedPatchStatus;
  reason: string;
  basedOn: string[];
  deduplicated?: boolean;
}

export interface DivergenceProgress {
  previous?: DivergenceRecord | null;
  current?: DivergenceRecord | null;
  movedForward: boolean;
  resolved: boolean;
  worsened: boolean;
  unchanged: boolean;
}

export interface PatchIterationResult {
  iterationId: string;
  startedAt: string;
  endedAt: string;
  bundle: RebuildBundleExport;
  run: RebuildRunResult;
  comparison: DivergenceComparisonResult;
  patchPlan: PatchPlan;
  appliedPatch?: AppliedPatchRecord | null;
  divergenceProgress: DivergenceProgress;
  nextActions: string[];
  whyTheseSteps: string[];
  stopIf: string[];
}

export interface AcceptanceRecord {
  taskId: string;
  recordedAt: string;
  status: AcceptanceStatus;
  targetUrl?: string;
  evidence?: Record<string, unknown>;
  notes?: string[];
}

export interface FixtureStabilityResult {
  stable: boolean;
  comparedSamples: number;
  mismatches: Array<{
    field: string;
    count: number;
    examples?: unknown[];
  }>;
  notes: string[];
}

export interface FixtureStabilizationResult {
  fixtures: RuntimeFixture[];
  stability: FixtureStabilityResult;
}

export interface PatchWorkflowOptions {
  url?: string;
  taskId?: string;
  taskSlug?: string;
  targetUrl?: string;
  goal?: string;
  fixtureSource?: 'current-page' | 'analyze-target-last';
  stabilizeFixture?: boolean;
  patchIterations?: number;
  autoApplyFirstSuggestion?: boolean;
  run?: {
    timeoutMs?: number;
    envOverrides?: Record<string, unknown>;
  };
  writeEvidence?: boolean;
}

export interface PatchWorkflowResult {
  task?: {
    taskId: string;
    taskDir: string;
  } | null;
  stability?: FixtureStabilityResult | null;
  rebuild?: {
    bundle: RebuildBundleExport;
    run: RebuildRunResult;
    comparison: DivergenceComparisonResult;
  };
  patchIterations: PatchIterationResult[];
  latestAcceptance?: AcceptanceRecord | null;
  readyForPureExtraction: boolean;
  nextActions: string[];
  whyTheseSteps: string[];
  stopIf: string[];
}
