export type PatchableSurface =
  | 'fixture-input'
  | 'compare-anchor'
  | 'request-validation'
  | 'helper-window'
  | 'env-shim'
  | 'unknown';

export interface PatchPreflightFocus {
  surface: PatchableSurface;
  target: string;
  confidence: number;
  reason: string;
  suggestedAction: string;
  notes?: string[];
}

export interface PatchPreflightResult {
  selected: PatchPreflightFocus | null;
  candidates: PatchPreflightFocus[];
  compareAnchorUsed?: {
    anchorId: string;
    label: string;
    kind: string;
  } | null;
  nextActions: string[];
  stopIf: string[];
  notes: string[];
}

export interface StoredPatchPreflightSnapshot {
  createdAt: string;
  taskId?: string;
  result: PatchPreflightResult;
}
