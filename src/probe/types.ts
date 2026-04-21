export interface ProbeStep {
  step: string;
  purpose: string;
  stopIf?: string;
}

export interface ProbePlan {
  planId: string;
  scenario?: string;
  targetName: string;
  basedOn: {
    scenarioWorkflow?: boolean;
    captureResult?: boolean;
    helperBoundary?: boolean;
    dependencyWindow?: boolean;
  };
  priority: number;
  steps: ProbeStep[];
  fixtureHints: string[];
  hookHints: string[];
  validationChecks: string[];
  nextActions: string[];
  stopIf: string[];
  notes: string[];
}

export interface StoredProbePlan {
  planId: string;
  createdAt: string;
  taskId?: string;
  result: ProbePlan;
}
