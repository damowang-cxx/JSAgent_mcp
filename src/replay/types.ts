import type { ScenarioAnalysisResult, ScenarioType } from '../scenario/types.js';

export type ReplayActionType =
  | 'click'
  | 'input'
  | 'submit'
  | 'evaluate'
  | 'navigate'
  | 'wait-for-selector'
  | 'wait-for-request'
  | 'wait-for-timeout';

export interface ReplayAction {
  type: ReplayActionType;
  selector?: string;
  value?: string;
  expression?: string;
  url?: string;
  method?: string;
  timeoutMs?: number;
  description?: string;
  optional?: boolean;
}

export interface ReplayStepResult {
  action: ReplayAction;
  ok: boolean;
  summary: string;
  startedAt: string;
  finishedAt: string;
  details?: Record<string, unknown>;
}

export interface CapturePreset {
  presetId: string;
  scenario?: ScenarioType;
  description: string;
  defaultHooks: string[];
  collectHints?: {
    topN?: number;
    includeDynamic?: boolean;
  };
  defaultCaptureWindowMs?: number;
  notes?: string[];
}

export interface ObservedReplayRequest {
  url: string;
  method: string;
  requestId?: string;
}

export interface ReplayRecipeResult {
  preset: CapturePreset;
  executedSteps: ReplayStepResult[];
  observedRequests: ObservedReplayRequest[];
  hookSummary: {
    recordCount: number;
    hookIds: string[];
  };
  suspiciousRequests: ScenarioAnalysisResult['suspiciousRequests'];
  scenarioResult?: ScenarioAnalysisResult | null;
  task?: { taskId: string; taskDir: string } | null;
  evidenceWritten: boolean;
  nextActions: string[];
  stopIf: string[];
  notes: string[];
}
