export interface ScenarioPatchHint {
  hintId: string;
  targetName: string;
  scenario?: string;
  focus: string;
  patchableSurface: 'env-shim' | 'fixture-input' | 'helper-window' | 'request-validation' | 'compare-anchor' | 'unknown';
  confidence: number;
  why: string;
  suggestedActions: string[];
  stopIf: string[];
}

export interface ScenarioPatchHintSet {
  setId: string;
  targetName: string;
  scenario?: string;
  basedOn: {
    helperBoundary?: boolean;
    dependencyWindow?: boolean;
    probePlan?: boolean;
    captureResult?: boolean;
    scenarioWorkflow?: boolean;
    rebuildWorkflow?: boolean;
    patchWorkflow?: boolean;
  };
  hints: ScenarioPatchHint[];
  rebuildNextActions: string[];
  pureNextActions: string[];
  notes: string[];
}

export interface StoredScenarioPatchHintSet {
  setId: string;
  createdAt: string;
  taskId?: string;
  result: ScenarioPatchHintSet;
}
