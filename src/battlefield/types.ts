export interface BattlefieldContext {
  contextId: string;
  selectedPage?: string;
  browserOps?: {
    sessionStateAvailable: boolean;
    storageSnapshotAvailable: boolean;
    preloadActive: boolean;
    stealthState?: string | null;
  };
  sourcePrecision?: {
    scriptCount: number;
    lastSearchAvailable: boolean;
    lastFindAvailable: boolean;
  };
  debuggerFinishing?: {
    exceptionMode?: string;
    watchCount: number;
    targetCount: number;
  };
  functionScalpel?: {
    hookCount: number;
    traceCount: number;
    monitorCount: number;
  };
  substrate?: {
    astAvailable: boolean;
    aiRoutingAvailable: boolean;
    stealthFeatureStateAvailable: boolean;
  };
  structuredWorkflow?: {
    scenarioAvailable: boolean;
    captureAvailable: boolean;
    helperBoundaryAvailable: boolean;
    dependencyWindowAvailable: boolean;
    compareAnchorAvailable: boolean;
    patchPreflightAvailable: boolean;
    rebuildContextAvailable: boolean;
    flowReasoningAvailable: boolean;
    purePreflightAvailable: boolean;
    regressionContextAvailable?: boolean;
    deliveryContextAvailable?: boolean;
  };
  notes: string[];
  nextActions: string[];
  stopIf: string[];
}

export interface BattlefieldActionPlan {
  planId: string;
  phase:
    | 'browser-ops'
    | 'source-precision'
    | 'function-scalpel'
    | 'debugger'
    | 'structured-reverse'
    | 'rebuild-pure'
    | 'regression-delivery';
  recommendedTools: string[];
  why: string;
  stopIf: string[];
  nextActions: string[];
  basedOn: string[];
}

export interface BattlefieldIntegrationSnapshot {
  context: BattlefieldContext;
  actionPlan?: BattlefieldActionPlan | null;
  createdAt: string;
  notes?: string[];
}

