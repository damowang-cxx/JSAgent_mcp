export type ReverseStage = 'observe' | 'capture' | 'rebuild' | 'patch' | 'pure' | 'port' | 'delivery';

export type StageStatus = 'not_started' | 'in_progress' | 'passed' | 'blocked';

export interface TaskStageState {
  status: StageStatus;
  reason?: string;
  updatedAt: string;
}

export interface TaskManifest {
  taskId: string;
  createdAt: string;
  updatedAt: string;
  targetUrl?: string;
  goal?: string;
  currentStage: ReverseStage;
  latestPointers: {
    analyzeTarget?: string | null;
    rebuildWorkflow?: string | null;
    patchWorkflow?: string | null;
    pureWorkflow?: string | null;
    portWorkflow?: string | null;
    acceptance?: string | null;
    baseline?: string | null;
    sdkPackage?: string | null;
    regressionRun?: string | null;
    upgradeWorkflow?: string | null;
    deliveryBundle?: string | null;
    deliverySmoke?: string | null;
    scenarioAnalysis?: string | null;
    scenarioCapture?: string | null;
    scenarioWorkflow?: string | null;
    helperBoundary?: string | null;
    dependencyWindow?: string | null;
    scenarioProbe?: string | null;
    boundaryFixture?: string | null;
    scenarioPatchHints?: string | null;
    debuggerBreakpoints?: string | null;
    debuggerPaused?: string | null;
    debuggerInspection?: string | null;
  };
  stageState: Record<string, TaskStageState>;
  notes?: string[];
}

export interface StageGateResult {
  stage: ReverseStage;
  passed: boolean;
  checkedAt: string;
  reasons: string[];
  missingArtifacts: string[];
  nextActions: string[];
}

export interface ArtifactPointer {
  kind: string;
  snapshotName?: string;
  logName?: string;
  createdAt: string;
  summary?: string;
}
