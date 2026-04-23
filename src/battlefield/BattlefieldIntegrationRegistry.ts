import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { TaskManifestManager } from '../task/TaskManifestManager.js';
import type { BattlefieldIntegrationSnapshot } from './types.js';

function isSnapshot(value: unknown): value is BattlefieldIntegrationSnapshot {
  return Boolean(value && typeof value === 'object' && 'context' in value);
}

export class BattlefieldIntegrationRegistry {
  private lastSnapshot: BattlefieldIntegrationSnapshot | null = null;

  constructor(private readonly deps: {
    evidenceStore: EvidenceStore;
    taskManifestManager: TaskManifestManager;
  }) {}

  setLast(snapshot: BattlefieldIntegrationSnapshot): void {
    this.lastSnapshot = cloneSnapshot(snapshot);
  }

  getLast(): BattlefieldIntegrationSnapshot | null {
    return this.lastSnapshot ? cloneSnapshot(this.lastSnapshot) : null;
  }

  async storeToTask(taskId: string, snapshot: BattlefieldIntegrationSnapshot): Promise<void> {
    await this.deps.evidenceStore.openTask({ taskId });
    this.lastSnapshot = cloneSnapshot(snapshot);
    await this.deps.evidenceStore.writeSnapshot(taskId, 'battlefield/latest', this.lastSnapshot);
    await this.deps.taskManifestManager.ensureTask(taskId);
    await this.deps.taskManifestManager.updatePointers(taskId, {
      battlefield: 'battlefield/latest'
    });
  }

  async readFromTask(taskId: string): Promise<BattlefieldIntegrationSnapshot | null> {
    try {
      const snapshot = await this.deps.evidenceStore.readSnapshot(taskId, 'battlefield/latest');
      return isSnapshot(snapshot) ? cloneSnapshot(snapshot) : null;
    } catch {
      return null;
    }
  }
}

function cloneSnapshot(snapshot: BattlefieldIntegrationSnapshot): BattlefieldIntegrationSnapshot {
  return {
    ...snapshot,
    actionPlan: snapshot.actionPlan
      ? {
          ...snapshot.actionPlan,
          basedOn: [...snapshot.actionPlan.basedOn],
          nextActions: [...snapshot.actionPlan.nextActions],
          recommendedTools: [...snapshot.actionPlan.recommendedTools],
          stopIf: [...snapshot.actionPlan.stopIf]
        }
      : snapshot.actionPlan ?? null,
    context: {
      ...snapshot.context,
      browserOps: snapshot.context.browserOps ? { ...snapshot.context.browserOps } : undefined,
      debuggerFinishing: snapshot.context.debuggerFinishing ? { ...snapshot.context.debuggerFinishing } : undefined,
      functionScalpel: snapshot.context.functionScalpel ? { ...snapshot.context.functionScalpel } : undefined,
      nextActions: [...snapshot.context.nextActions],
      notes: [...snapshot.context.notes],
      sourcePrecision: snapshot.context.sourcePrecision ? { ...snapshot.context.sourcePrecision } : undefined,
      stopIf: [...snapshot.context.stopIf],
      structuredWorkflow: snapshot.context.structuredWorkflow ? { ...snapshot.context.structuredWorkflow } : undefined,
      substrate: snapshot.context.substrate ? { ...snapshot.context.substrate } : undefined
    },
    notes: snapshot.notes ? [...snapshot.notes] : undefined
  };
}

