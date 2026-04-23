export interface DebuggerScriptSummary {
  scriptId: string;
  url?: string;
  sourceMapURL?: string;
  length?: number;
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
  hasSourceURL?: boolean;
  isModule?: boolean;
}

export interface BreakpointLocation {
  scriptId?: string;
  url?: string;
  lineNumber: number;
  columnNumber: number;
}

export interface ManagedBreakpoint {
  breakpointId: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
  source: 'url-line' | 'text-search';
  textQuery?: string;
  createdAt: string;
  locations: BreakpointLocation[];
}

export interface DebuggerCallFrameSummary {
  functionName: string;
  url?: string;
  scriptId?: string;
  lineNumber: number;
  columnNumber: number;
}

export interface PausedStateSummary {
  isPaused: boolean;
  reason?: string;
  hitBreakpoints: string[];
  topFrame?: DebuggerCallFrameSummary | null;
  callFrames: DebuggerCallFrameSummary[];
  pausedAt?: string;
}

export interface StoredBreakpointSnapshot {
  createdAt: string;
  taskId?: string;
  items: ManagedBreakpoint[];
}

export interface StoredPausedSnapshot {
  createdAt: string;
  taskId?: string;
  state: PausedStateSummary;
}

export interface DebuggerScopeVariable {
  name: string;
  valueType: string;
  preview: string;
  value?: unknown;
  truncated?: boolean;
}

export interface DebuggerScopeSummary {
  type: string;
  name?: string;
  variables: DebuggerScopeVariable[];
}

export interface DebuggerCallFrameDetail {
  callFrameId: string;
  functionName: string;
  url?: string;
  scriptId?: string;
  lineNumber: number;
  columnNumber: number;
  scopes?: DebuggerScopeSummary[];
}

export interface CallFrameEvaluationResult {
  ok: boolean;
  resultType?: string;
  preview?: string;
  value?: unknown;
  error?: string;
  evaluatedAt: string;
}

export type ExceptionBreakpointMode = 'none' | 'uncaught' | 'caught' | 'all';

export interface WatchExpressionRecord {
  watchId: string;
  expression: string;
  createdAt: string;
  enabled: boolean;
}

export interface WatchExpressionValue {
  watchId: string;
  expression: string;
  ok: boolean;
  preview?: string;
  valueType?: string;
  error?: string;
  evaluatedAt: string;
}

export interface DebugTargetSummary {
  targetId: string;
  kind: 'page' | 'worker' | 'shared-worker' | 'unknown';
  title?: string;
  url?: string;
  isSelectedPage?: boolean;
  isCurrentDebuggerTarget?: boolean;
}

export interface DebuggerFinishingSnapshot {
  createdAt?: string;
  exceptionBreakpointMode?: ExceptionBreakpointMode;
  watchExpressions?: WatchExpressionRecord[];
  lastWatchValues?: WatchExpressionValue[];
  lastDebugTargets?: DebugTargetSummary[];
  currentDebugTargetId?: string | null;
  notes?: string[];
}

export interface DebuggerCorrelationHint {
  kind: 'request' | 'hook' | 'scenario-target' | 'sink';
  value: string;
  reason: string;
  confidence: number;
}

export interface StoredDebuggerInspectionSnapshot {
  createdAt: string;
  taskId?: string;
  callFrames: DebuggerCallFrameDetail[];
  correlations?: DebuggerCorrelationHint[];
  evaluations?: CallFrameEvaluationResult[];
  notes?: string[];
}

export interface DebuggerReportInput {
  breakpoints: ManagedBreakpoint[];
  pausedState: PausedStateSummary;
  callFrames: DebuggerCallFrameDetail[];
  correlations: DebuggerCorrelationHint[];
  notes: string[];
}
