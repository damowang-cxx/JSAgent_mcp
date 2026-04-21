export type CompareAnchorKind =
  | 'helper-return'
  | 'request-field'
  | 'header'
  | 'body-field'
  | 'request-level'
  | 'unknown';

export type CompareAnchorEvidenceSource =
  | 'scenario'
  | 'capture'
  | 'helper-boundary'
  | 'dependency-window'
  | 'probe-plan'
  | 'boundary-fixture'
  | 'patch-hints'
  | 'debugger'
  | 'rebuild';

export type CompareStrategy = 'exact' | 'normalized-string' | 'presence-only' | 'structured-subset';

export interface CompareAnchor {
  anchorId: string;
  kind: CompareAnchorKind;
  label: string;
  path?: string;
  sourceEvidence: CompareAnchorEvidenceSource[];
  confidence: number;
  reason: string;
  compareStrategy: CompareStrategy;
  expectedOrigin?: string;
  notes?: string[];
}

export interface CompareAnchorSelectionResult {
  selected: CompareAnchor | null;
  candidates: CompareAnchor[];
  nextActions: string[];
  stopIf: string[];
  notes: string[];
}

export interface StoredCompareAnchorSnapshot {
  createdAt: string;
  taskId?: string;
  result: CompareAnchorSelectionResult;
}
