export interface AstFunctionLocation {
  scriptId: string;
  url?: string;
  functionName?: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  kind: 'function-declaration' | 'function-expression' | 'arrow-function' | 'object-method' | 'class-method';
}

export interface AstReferenceMatch {
  scriptId: string;
  url?: string;
  lineNumber: number;
  columnNumber: number;
  contextPreview: string;
  kind: 'identifier' | 'member-expression' | 'callsite' | 'assignment' | 'property-write' | 'property-read';
}

export interface AstRewritePreview {
  scriptId: string;
  url?: string;
  rewriteKind: 'rename-local' | 'inline-constant' | 'pretty-print' | 'normalize-member-access';
  preview: string;
  notes: string[];
  truncated?: boolean;
}

export interface AstSubstrateSnapshot {
  createdAt?: string;
  locatedFunctions?: AstFunctionLocation[];
  foundReferences?: AstReferenceMatch[];
  rewritePreviews?: AstRewritePreview[];
  notes?: string[];
}
