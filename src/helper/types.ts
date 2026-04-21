export interface HelperBoundaryInput {
  name: string;
  source: 'param' | 'header' | 'body-field' | 'hook' | 'code' | 'unknown';
  confidence: number;
  reason: string;
}

export interface HelperBoundaryOutput {
  name: string;
  target: 'request-param' | 'header' | 'body-field' | 'return' | 'unknown';
  confidence: number;
  reason: string;
}

export interface HelperBoundaryResult {
  helperName: string;
  file?: string;
  kind?: string;
  confidence: number;
  inputs: HelperBoundaryInput[];
  outputs: HelperBoundaryOutput[];
  relatedRequests: Array<{
    url: string;
    method: string;
    matchedFields: string[];
  }>;
  recommendedHooks: string[];
  rebuildHints: string[];
  pureHints: string[];
  notes: string[];
}

export interface StoredHelperBoundary {
  boundaryId: string;
  createdAt: string;
  taskId?: string;
  result: HelperBoundaryResult;
}
