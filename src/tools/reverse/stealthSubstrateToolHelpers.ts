import { AppError } from '../../core/errors.js';
import type { StealthRuntimeState } from '../../stealth/StealthCoordinator.js';
import type { ToolContext } from '../ToolDefinition.js';

export async function recordStealthSubstrate(
  context: ToolContext,
  input: {
    taskId?: string;
    writeEvidence?: boolean;
    evidence: Record<string, unknown>;
    state: StealthRuntimeState;
  }
): Promise<boolean> {
  context.runtime.getStealthCoordinator().setLast(input.state);
  if (!input.taskId || !input.writeEvidence) {
    return false;
  }

  const evidenceStore = context.runtime.getEvidenceStore();
  await evidenceStore.openTask({ taskId: input.taskId });
  await evidenceStore.appendLog(input.taskId, 'runtime-evidence', input.evidence);
  await context.runtime.getStealthCoordinator().storeToTask(input.taskId, input.state);
  return true;
}

export async function readStealthSubstrateState(
  context: ToolContext,
  params: {
    taskId?: string;
    source?: 'runtime-last' | 'task-artifact';
  },
  toolName: string
): Promise<{ state: StealthRuntimeState | null; source: 'runtime-last' | 'task-artifact' }> {
  if (params.source === 'task-artifact' && !params.taskId) {
    throw new AppError('TASK_ID_REQUIRED', `${toolName} with source=task-artifact requires taskId.`);
  }

  if (params.taskId && params.source !== 'runtime-last') {
    const state = await context.runtime.getStealthCoordinator().readFromTask(params.taskId);
    if (state) {
      return {
        source: 'task-artifact',
        state
      };
    }
    if (params.source === 'task-artifact') {
      throw new AppError('STEALTH_SUBSTRATE_SNAPSHOT_NOT_FOUND', `No stealth-substrate/latest snapshot found for task ${params.taskId}.`);
    }
  }

  return {
    source: 'runtime-last',
    state: context.runtime.getStealthCoordinator().getRuntimeState()
  };
}
