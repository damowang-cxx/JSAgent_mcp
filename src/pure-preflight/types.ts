export type PurePreflightSource =
  | 'boundary-fixture'
  | 'compare-anchor'
  | 'patch-preflight'
  | 'rebuild-context'
  | 'flow-reasoning'
  | 'dependency-window'
  | 'helper-boundary'
  | 'generic-pure'
  | 'unknown';

export interface PurePreflightContext {
  contextId: string;
  source: PurePreflightSource;
  usedBoundaryFixture?: {
    fixtureId: string;
    targetName: string;
  } | null;
  usedCompareAnchor?: {
    anchorId: string;
    label: string;
    kind: string;
  } | null;
  usedPatchPreflight?: {
    surface: string;
    target: string;
  } | null;
  usedRebuildContext?: {
    contextId: string;
    fixtureSource: string;
  } | null;
  usedFlowReasoning?: {
    resultId: string;
    targetName: string;
  } | null;
  expectedOutputs: Array<{
    name: string;
    target: string;
    reason: string;
  }>;
  preservedInputs: Array<{
    name: string;
    preserveFreshness: boolean;
    reason: string;
  }>;
  excludedNoise: string[];
  pureNotes: string[];
  nextActions: string[];
  stopIf: string[];
}

export interface StoredPurePreflightSnapshot {
  createdAt: string;
  taskId?: string;
  result: PurePreflightContext;
}
