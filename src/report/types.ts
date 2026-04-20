import type { AnalyzeTargetResult } from '../analysis/types.js';
import type { RebuildWorkflowResult } from '../rebuild/types.js';

export type ReverseReportFormat = 'json' | 'markdown';
export type RebuildReportFormat = 'json' | 'markdown';

export interface ReverseReportExport {
  json?: Record<string, unknown>;
  markdown?: string;
}

export interface ReverseReportBuilderInput {
  result: AnalyzeTargetResult;
  format: ReverseReportFormat;
}

export interface RebuildReportBuilderInput {
  result: RebuildWorkflowResult;
  format: RebuildReportFormat;
}
