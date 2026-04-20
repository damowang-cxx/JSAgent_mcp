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
    const plans = Array.from(this.plans.values())
      .filter((plan) => taskId === undefined || plan.taskId === taskId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    return plans;
  }

  async recordApplied(record: AppliedPatchRecord): Promise<void> {
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
    return Array.from(this.applied.values())
      .filter((record) => taskId === undefined || record.taskId === taskId)
      .sort((left, right) => left.appliedAt.localeCompare(right.appliedAt));
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
