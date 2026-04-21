export interface DebuggerScriptSummary {
  scriptId: string;
  url?: string;
  sourceMapURL?: string;
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
