export type RebuildInputSource =
  | 'boundary-fixture'
  | 'dependency-window'
  | 'compare-anchor'
  | 'patch-preflight'
  | 'scenario-patch-hints'
  | 'generic-fixture'
  | 'unknown';

export interface RebuildContext {
  contextId: string;
  fixtureSource: RebuildInputSource;
  usedBoundaryFixture?: {
    fixtureId: string;
    targetName: string;
  } | null;
  usedCompareAnchor?: {
    anchorId: string;
    label: string;
    kind: string;
    compareStrategy: string;
  } | null;
  usedPatchPreflight?: {
    surface: string;
    target: string;
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
  rebuildNotes: string[];
  nextActions: string[];
  stopIf: string[];
}

export interface StoredRebuildContextSnapshot {
  createdAt: string;
  taskId?: string;
  result: RebuildContext;
}
