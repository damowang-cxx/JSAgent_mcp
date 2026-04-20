import type { AnalyzeTargetResult } from '../analysis/types.js';
import type { PatchIterationResult, PatchWorkflowResult } from '../patch/types.js';
import type { PortWorkflowResult } from '../port/types.js';
import type { PureExtractionResult } from '../pure/types.js';
import type { RebuildWorkflowResult } from '../rebuild/types.js';

export type ReverseReportFormat = 'json' | 'markdown';
export type RebuildReportFormat = 'json' | 'markdown';
export type PatchReportFormat = 'json' | 'markdown';
export type PureReportFormat = 'json' | 'markdown';
export type PortReportFormat = 'json' | 'markdown';

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

export interface PatchIterationReportBuilderInput {
  result: PatchIterationResult;
  format: PatchReportFormat;
}

export interface PatchWorkflowReportBuilderInput {
  result: PatchWorkflowResult;
  format: PatchReportFormat;
}

export interface PureReportBuilderInput {
  result: PureExtractionResult;
  format: PureReportFormat;
}

export interface PortReportBuilderInput {
  result: PortWorkflowResult;
  format: PortReportFormat;
}
