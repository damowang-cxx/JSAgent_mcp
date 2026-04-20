import type { ReverseStage, TaskManifest, TaskStageState } from './types.js';

export const REVERSE_STAGES: readonly ReverseStage[] = [
  'observe',
  'capture',
  'rebuild',
  'patch',
  'pure',
  'port',
  'delivery'
] as const;

export function nowIso(): string {
  return new Date().toISOString();
}

export function emptyStageState(status: TaskStageState['status'] = 'not_started', reason?: string): TaskStageState {
  return {
    ...(reason ? { reason } : {}),
    status,
    updatedAt: nowIso()
  };
}

export function createDefaultManifest(input: {
  taskId: string;
  createdAt?: string;
  goal?: string;
  targetUrl?: string;
}): TaskManifest {
  const createdAt = input.createdAt ?? nowIso();
  return {
    createdAt,
    currentStage: 'observe',
    goal: input.goal,
    latestPointers: {},
    stageState: Object.fromEntries(REVERSE_STAGES.map((stage) => [stage, emptyStageState()])) as TaskManifest['stageState'],
    targetUrl: input.targetUrl,
    taskId: input.taskId,
    updatedAt: createdAt
  };
}

export function highestPassedStage(stageState: TaskManifest['stageState']): ReverseStage {
  let current: ReverseStage = 'observe';
  for (const stage of REVERSE_STAGES) {
    if (stageState[stage]?.status === 'passed') {
      current = stage;
    }
  }
  return current;
}
