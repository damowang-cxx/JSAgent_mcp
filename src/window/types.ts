export type DependencyWindowNodeKind = 'function' | 'variable' | 'class' | 'request-sink' | 'helper' | 'unknown';

export interface DependencyWindowNode {
  name: string;
  kind: DependencyWindowNodeKind;
  file?: string;
  confidence: number;
  reason: string;
}

export interface DependencyWindowInput {
  name: string;
  source: 'param' | 'header' | 'body-field' | 'hook' | 'code' | 'token-family' | 'unknown';
  preserveAsExternal: boolean;
  confidence: number;
  reason: string;
}

export interface DependencyWindowOutput {
  name: string;
  target: 'request-param' | 'header' | 'body-field' | 'return' | 'intermediate' | 'unknown';
  confidence: number;
  reason: string;
}

export interface DependencyWindowSnippet {
  file: string;
  startLine: number;
  endLine: number;
  preview: string;
  reason: string;
}

export interface DependencyWindowResult {
  windowId: string;
  targetName: string;
  targetKind: 'helper' | 'function';
  scenario?: string;
  files: string[];
  snippets: DependencyWindowSnippet[];
  nodes: DependencyWindowNode[];
  inputs: DependencyWindowInput[];
  outputs: DependencyWindowOutput[];
  validationAnchors: Array<{
    type: 'request' | 'sink' | 'hook' | 'token-binding';
    value: string;
    reason: string;
  }>;
  excludedNoise: string[];
  exportHints: string[];
  rebuildPreflightHints: string[];
  purePreflightHints: string[];
  notes: string[];
}

export interface StoredDependencyWindow {
  windowId: string;
  createdAt: string;
  taskId?: string;
  result: DependencyWindowResult;
}
