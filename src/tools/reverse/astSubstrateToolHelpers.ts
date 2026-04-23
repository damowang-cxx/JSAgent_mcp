import { AppError } from '../../core/errors.js';
import type { AstSubstrateSnapshot } from '../../ast-substrate/types.js';
import type { ToolContext } from '../ToolDefinition.js';

export async function recordAstSubstrate(
  context: ToolContext,
  input: {
    taskId?: string;
    writeEvidence?: boolean;
    evidence: Record<string, unknown>;
    snapshot: AstSubstrateSnapshot;
  }
): Promise<boolean> {
  context.runtime.getAstSubstrateRegistry().setLast(input.snapshot);
  if (!input.taskId || !input.writeEvidence) {
    return false;
  }

  const evidenceStore = context.runtime.getEvidenceStore();
  await evidenceStore.openTask({ taskId: input.taskId });
  await evidenceStore.appendLog(input.taskId, 'runtime-evidence', input.evidence);
  await context.runtime.getAstSubstrateRegistry().storeToTask(input.taskId, input.snapshot);
  return true;
}

export async function readAstSubstrateSnapshot(
  context: ToolContext,
  params: {
    taskId?: string;
    source?: 'runtime-last' | 'task-artifact';
  },
  toolName: string
): Promise<{ snapshot: AstSubstrateSnapshot | null; source: 'runtime-last' | 'task-artifact' }> {
  if (params.source === 'task-artifact' && !params.taskId) {
    throw new AppError('TASK_ID_REQUIRED', `${toolName} with source=task-artifact requires taskId.`);
  }

  if (params.taskId && params.source !== 'runtime-last') {
    const snapshot = await context.runtime.getAstSubstrateRegistry().readFromTask(params.taskId);
    if (snapshot) {
      return {
        snapshot,
        source: 'task-artifact'
      };
    }
    if (params.source === 'task-artifact') {
      throw new AppError('AST_SUBSTRATE_SNAPSHOT_NOT_FOUND', `No ast-substrate/latest snapshot found for task ${params.taskId}.`);
    }
  }

  return {
    snapshot: context.runtime.getAstSubstrateRegistry().getLast(),
    source: 'runtime-last'
  };
}
