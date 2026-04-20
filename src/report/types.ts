import type { AnalyzeTargetResult } from '../analysis/types.js';

export type ReverseReportFormat = 'json' | 'markdown';

export interface ReverseReportExport {
  json?: Record<string, unknown>;
  markdown?: string;
}

export interface ReverseReportBuilderInput {
  result: AnalyzeTargetResult;
  format: ReverseReportFormat;
}
