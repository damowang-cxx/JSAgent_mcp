export interface FunctionHookRecord {
  hookId: string;
  targetExpression: string;
  createdAt: string;
  mode: 'hook' | 'trace';
  urlFilter?: string;
  enabled: boolean;
  options?: {
    logArgs?: boolean;
    logResult?: boolean;
    logStack?: boolean;
    pauseOnCall?: boolean;
  };
}

export interface FunctionTraceRecord {
  traceId?: string;
  hookId: string;
  calledAt: string;
  targetExpression: string;
  argsPreview?: unknown[];
  resultPreview?: unknown;
  stackPreview?: string[];
  error?: string;
}

export interface ObjectInspectionProperty {
  name: string;
  valueType: string;
  preview: string;
  truncated?: boolean;
}

export interface ObjectInspectionResult {
  targetExpression: string;
  inspectedAt: string;
  preview: string;
  properties: ObjectInspectionProperty[];
  prototypeChain?: string[];
}

export interface EventMonitorRecord {
  monitorId: string;
  eventType: string;
  target: 'document' | 'window' | 'selector';
  selector?: string;
  createdAt: string;
  enabled: boolean;
}

export interface EventOccurrence {
  occurrenceId?: string;
  monitorId: string;
  eventType: string;
  firedAt: string;
  targetSummary?: string;
  payloadPreview?: Record<string, unknown>;
}

export interface FunctionScalpelSnapshot {
  createdAt?: string;
  hooks?: FunctionHookRecord[];
  traces?: FunctionTraceRecord[];
  inspections?: ObjectInspectionResult[];
  monitors?: EventMonitorRecord[];
  events?: EventOccurrence[];
  notes?: string[];
}
