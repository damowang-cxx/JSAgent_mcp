export interface FixtureField {
  name: string;
  source: 'boundary-input' | 'window-input' | 'token-binding' | 'request-field' | 'hook-sample' | 'unknown';
  required: boolean;
  preserveFreshness: boolean;
  confidence: number;
  reason: string;
}

export interface FixtureExpectedOutput {
  name: string;
  target: 'helper-return' | 'request-param' | 'header' | 'body-field' | 'unknown';
  confidence: number;
  reason: string;
}

export interface FixtureCandidateResult {
  fixtureId: string;
  targetName: string;
  scenario?: string;
  basedOn: {
    helperBoundary?: boolean;
    dependencyWindow?: boolean;
    probePlan?: boolean;
    captureResult?: boolean;
    scenarioWorkflow?: boolean;
  };
  inputs: FixtureField[];
  expectedOutputs: FixtureExpectedOutput[];
  validationAnchors: Array<{
    type: 'request' | 'sink' | 'hook' | 'token-binding';
    value: string;
    reason: string;
  }>;
  excludedNoise: string[];
  rebuildUsageHints: string[];
  pureUsageHints: string[];
  notes: string[];
}

export interface StoredFixtureCandidate {
  fixtureId: string;
  createdAt: string;
  taskId?: string;
  result: FixtureCandidateResult;
}
