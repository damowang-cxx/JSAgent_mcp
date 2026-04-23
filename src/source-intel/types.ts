export interface ScriptSummary {
  scriptId: string;
  url?: string;
  sourceMapURL?: string;
  lengthHint?: number | null;
  lineCountHint?: number | null;
  isInline?: boolean;
  isEvalLike?: boolean;
}

export type ScriptSourceExcerptMode = 'line-range' | 'offset-range' | 'full';

export interface ScriptSourceExcerpt {
  scriptId: string;
  url?: string;
  mode: ScriptSourceExcerptMode;
  startLine?: number;
  endLine?: number;
  offset?: number;
  length?: number;
  text: string;
  sourceLength?: number;
  totalLines?: number;
  truncated?: boolean;
  notes?: string[];
}

export interface ScriptFindMatch {
  scriptId: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  offset?: number;
  contextPreview: string;
  occurrence: number;
  matchText?: string;
}

export interface SourceSearchMatch {
  scriptId: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  offset?: number;
  linePreview: string;
  matchText?: string;
  occurrence?: number;
}

export interface SourceExtractionSummary {
  scriptId: string;
  url?: string;
  mode: ScriptSourceExcerptMode;
  startLine?: number;
  endLine?: number;
  offset?: number;
  length?: number;
  sourceLength?: number;
  totalLines?: number;
  truncated?: boolean;
}

export interface SourcePrecisionSnapshot {
  createdAt?: string;
  lastScriptList?: ScriptSummary[];
  lastSourceRead?: SourceExtractionSummary;
  lastFindResult?: ScriptFindMatch[];
  lastSearchResult?: SourceSearchMatch[];
  notes?: string[];
}
