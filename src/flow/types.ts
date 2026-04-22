export type FlowReasoningNodeKind =
  | 'function'
  | 'assignment'
  | 'property-write'
  | 'property-read'
  | 'callsite'
  | 'return-consumer'
  | 'request-binder'
  | 'sink-adjacent'
  | 'unknown';

export type FlowReasoningEdgeRelation =
  | 'returns-to'
  | 'assigned-to'
  | 'passed-to'
  | 'binds-field'
  | 'calls'
  | 'adjacent-to-sink'
  | 'reads-from'
  | 'writes-to';

export interface FlowReasoningNode {
  name: string;
  kind: FlowReasoningNodeKind;
  file?: string;
  lineNumber?: number;
  confidence: number;
  reason: string;
}

export interface FlowReasoningEdge {
  from: string;
  to: string;
  relation: FlowReasoningEdgeRelation;
  confidence: number;
  reason: string;
}

export interface FlowReasoningResult {
  resultId: string;
  targetName: string;
  scenario?: string;
  files: string[];
  nodes: FlowReasoningNode[];
  edges: FlowReasoningEdge[];
  helperConsumers: string[];
  requestFieldBindings: string[];
  sinkAdjacentBindings: string[];
  rebuildHints: string[];
  patchHints: string[];
  notes: string[];
}

export interface StoredFlowReasoningSnapshot {
  createdAt: string;
  taskId?: string;
  result: FlowReasoningResult;
}

export interface AstFunctionEntry {
  name: string;
  file: string;
  lineNumber: number;
}

export interface AstAssignmentEntry {
  target: string;
  valuePreview?: string;
  file: string;
  lineNumber: number;
  functionName?: string;
}

export interface AstPropertyWriteEntry {
  objectName?: string;
  property: string;
  valuePreview?: string;
  file: string;
  lineNumber: number;
  functionName?: string;
}

export interface AstPropertyReadEntry {
  objectName?: string;
  property: string;
  file: string;
  lineNumber: number;
  functionName?: string;
}

export interface AstCallEntry {
  callee: string;
  argsPreview: string[];
  file: string;
  lineNumber: number;
  functionName?: string;
}

export interface LightweightAstIndex {
  functions: AstFunctionEntry[];
  assignments: AstAssignmentEntry[];
  propertyWrites: AstPropertyWriteEntry[];
  propertyReads: AstPropertyReadEntry[];
  calls: AstCallEntry[];
  files: string[];
  notes: string[];
}
