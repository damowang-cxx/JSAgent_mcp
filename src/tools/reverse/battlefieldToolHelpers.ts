import { AppError } from '../../core/errors.js';
import type { BattlefieldActionPlan, BattlefieldContext, BattlefieldIntegrationSnapshot } from '../../battlefield/types.js';
import type { ToolContext } from '../ToolDefinition.js';

export function buildBattlefieldSnapshot(input: {
  context: BattlefieldContext;
  actionPlan?: BattlefieldActionPlan | null;
  notes?: string[];
}): BattlefieldIntegrationSnapshot {
  return {
    actionPlan: input.actionPlan ?? null,
    context: input.context,
    createdAt: new Date().toISOString(),
    notes: input.notes ?? [
      'Battlefield integration keeps browser ops, source precision, debugger, function scalpel, and structured reverse lineage aligned.'
    ]
  };
}

export async function recordBattlefieldSnapshot(
  context: ToolContext,
  input: {
    taskId?: string;
    writeEvidence?: boolean;
    evidence: Record<string, unknown>;
    snapshot: BattlefieldIntegrationSnapshot;
  }
): Promise<boolean> {
  context.runtime.getBattlefieldIntegrationRegistry().setLast(input.snapshot);
  if (!input.taskId || !input.writeEvidence) {
    return false;
  }

  const evidenceStore = context.runtime.getEvidenceStore();
  await evidenceStore.openTask({ taskId: input.taskId });
  await evidenceStore.appendLog(input.taskId, 'runtime-evidence', input.evidence);
  await context.runtime.getBattlefieldIntegrationRegistry().storeToTask(input.taskId, input.snapshot);
  return true;
}

export async function readBattlefieldSnapshot(
  context: ToolContext,
  params: {
    taskId?: string;
    source?: 'runtime-last' | 'task-artifact';
  },
  toolName: string
): Promise<{ snapshot: BattlefieldIntegrationSnapshot | null; source: 'runtime-last' | 'task-artifact' }> {
  if (params.source === 'task-artifact' && !params.taskId) {
    throw new AppError('TASK_ID_REQUIRED', `${toolName} with source=task-artifact requires taskId.`);
  }

  if (params.taskId && params.source !== 'runtime-last') {
    const snapshot = await context.runtime.getBattlefieldIntegrationRegistry().readFromTask(params.taskId);
    if (snapshot) {
      return {
        snapshot,
        source: 'task-artifact'
      };
    }
    if (params.source === 'task-artifact') {
      throw new AppError('BATTLEFIELD_SNAPSHOT_NOT_FOUND', `No battlefield/latest snapshot found for task ${params.taskId}.`);
    }
  }

  return {
    snapshot: context.runtime.getBattlefieldIntegrationRegistry().getLast(),
    source: 'runtime-last'
  };
}

