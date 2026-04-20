import { randomUUID } from 'node:crypto';

import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { DivergenceRecord, PatchSuggestion } from '../rebuild/types.js';
import type { AppliedPatchRecord, PatchPlan } from './types.js';

export class PatchPlanManager {
  private readonly plans = new Map<string, PatchPlan>();
  private readonly applied = new Map<string, AppliedPatchRecord>();

  constructor(private readonly evidenceStore: EvidenceStore) {}

  async createPlan(input: {
    taskId?: string;
    divergence: DivergenceRecord | null | undefined;
    suggestions: PatchSuggestion[];
    notes?: string[];
  }): Promise<PatchPlan> {
    const plan: PatchPlan = {
      basedOnDivergence: input.divergence ?? null,
      createdAt: new Date().toISOString(),
      notes: input.notes,
      planId: `patch-plan-${randomUUID()}`,
      selectedSuggestion: input.suggestions[0] ?? null,
      status: 'open',
      suggestions: input.suggestions,
      taskId: input.taskId ?? null
    };

    this.plans.set(plan.planId, plan);
    await this.persistPlan(plan, 'created');
    return plan;
  }

  async listPlans(taskId?: string): Promise<PatchPlan[]> {
    const evidencePlans = taskId ? await this.loadPlansFromEvidence(taskId) : [];
    for (const plan of evidencePlans) {
      this.plans.set(plan.planId, plan);
    }

    const plansById = new Map<string, PatchPlan>();
    for (const plan of [...evidencePlans, ...this.plans.values()]) {
      if (taskId !== undefined && plan.taskId !== taskId) {
        continue;
      }
      plansById.set(plan.planId, plan);
    }
    const plans = Array.from(plansById.values()).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    return plans;
  }

  async recordApplied(record: AppliedPatchRecord): Promise<void> {
    if (record.taskId) {
      const existing = await this.listApplied(record.taskId);
      if (existing.some((item) => sameAppliedPatch(item, record))) {
        return;
      }
    } else if (Array.from(this.applied.values()).some((item) => sameAppliedPatch(item, record))) {
      return;
    }

    this.applied.set(record.patchId, record);
    if (!record.taskId) {
      return;
    }

    await this.evidenceStore.openTask({ taskId: record.taskId });
    await this.evidenceStore.appendLog(record.taskId, 'runtime-evidence', {
      kind: 'applied_patch',
      patch: record
    });
    await this.evidenceStore.writeSnapshot(record.taskId, 'latest-applied-patch', record);
  }

  async listApplied(taskId?: string): Promise<AppliedPatchRecord[]> {
    const evidenceApplied = taskId ? await this.loadAppliedFromEvidence(taskId) : [];
    for (const record of evidenceApplied) {
      this.applied.set(record.patchId, record);
    }

    const appliedById = new Map<string, AppliedPatchRecord>();
    for (const record of [...evidenceApplied, ...this.applied.values()]) {
      if (taskId !== undefined && record.taskId !== taskId) {
        continue;
      }
      appliedById.set(record.patchId, record);
    }

    return Array.from(appliedById.values()).sort((left, right) => left.appliedAt.localeCompare(right.appliedAt));
  }

  async getLatestPlan(taskId?: string): Promise<PatchPlan | null> {
    const plans = await this.listPlans(taskId);
    return plans.at(-1) ?? null;
  }

  async markApplied(planId: string, selectedSuggestion: PatchSuggestion): Promise<void> {
    await this.updatePlan(planId, {
      selectedSuggestion,
      status: 'applied'
    }, 'applied');
  }

  async markSuperseded(planId: string): Promise<void> {
    await this.updatePlan(planId, {
      status: 'superseded'
    }, 'superseded');
  }

  async markAccepted(planId: string): Promise<void> {
    await this.updatePlan(planId, {
      status: 'accepted'
    }, 'accepted');
  }

  private async updatePlan(planId: string, patch: Partial<PatchPlan>, action: string): Promise<void> {
    const existing = this.plans.get(planId);
    if (!existing) {
      return;
    }

    const updated = {
      ...existing,
      ...patch
    };
    this.plans.set(planId, updated);
    await this.persistPlan(updated, action);
  }

  private async loadPlansFromEvidence(taskId: string): Promise<PatchPlan[]> {
    try {
      const records = await this.evidenceStore.readLog(taskId, 'runtime-evidence');
      const plans = new Map<string, PatchPlan>();
      for (const record of records) {
        if (record.kind !== 'patch_plan' || !isRecord(record.plan)) {
          continue;
        }
        const plan = record.plan as unknown as PatchPlan;
        if (typeof plan.planId !== 'string') {
          continue;
        }
        plans.set(plan.planId, plan);
      }
      return Array.from(plans.values());
    } catch {
      return [];
    }
  }

  private async loadAppliedFromEvidence(taskId: string): Promise<AppliedPatchRecord[]> {
    try {
      const records = await this.evidenceStore.readLog(taskId, 'runtime-evidence');
      const applied = new Map<string, AppliedPatchRecord>();
      for (const record of records) {
        if (record.kind !== 'applied_patch' || !isRecord(record.patch)) {
          continue;
        }
        const patch = record.patch as unknown as AppliedPatchRecord;
        if (typeof patch.patchId !== 'string') {
          continue;
        }
        applied.set(patch.patchId, patch);
      }
      return Array.from(applied.values());
    } catch {
      return [];
    }
  }

  private async persistPlan(plan: PatchPlan, action: string): Promise<void> {
    if (!plan.taskId) {
      return;
    }

    await this.evidenceStore.openTask({ taskId: plan.taskId });
    await this.evidenceStore.appendLog(plan.taskId, 'runtime-evidence', {
      kind: 'patch_plan',
      action,
      plan
    });
    await this.evidenceStore.writeSnapshot(plan.taskId, 'latest-patch-plan', plan);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function sameAppliedPatch(left: AppliedPatchRecord, right: AppliedPatchRecord): boolean {
  return (
    left.planId === right.planId &&
    left.target === right.target &&
    (left.suggestedCode ?? '').trim() === (right.suggestedCode ?? '').trim()
  );
}
