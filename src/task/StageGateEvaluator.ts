import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import { REVERSE_STAGES } from './state.js';
import type { ReverseStage, StageGateResult } from './types.js';
import type { TaskManifestManager } from './TaskManifestManager.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

export class StageGateEvaluator {
  constructor(
    private readonly deps: {
      evidenceStore: EvidenceStore;
      taskManifestManager: TaskManifestManager;
    }
  ) {}

  async evaluate(taskId: string, stage: ReverseStage): Promise<StageGateResult> {
    await this.deps.taskManifestManager.ensureTask(taskId);
    const snapshots = await this.deps.evidenceStore.listSnapshots(taskId);
    const logs = await this.readLogs(taskId);
    const result = await this.evaluateWithArtifacts(taskId, stage, snapshots, logs);
    await this.deps.taskManifestManager.updateStageState(taskId, stage, {
      reason: result.reasons.join(' '),
      status: result.passed ? 'passed' : 'blocked',
      updatedAt: result.checkedAt
    });
    return result;
  }

  async evaluateAll(taskId: string): Promise<Record<ReverseStage, StageGateResult>> {
    const entries: Array<readonly [ReverseStage, StageGateResult]> = [];
    for (const stage of REVERSE_STAGES) {
      entries.push([stage, await this.evaluate(taskId, stage)] as const);
    }
    return Object.fromEntries(entries) as Record<ReverseStage, StageGateResult>;
  }

  private async evaluateWithArtifacts(
    taskId: string,
    stage: ReverseStage,
    snapshots: string[],
    logs: Record<string, Array<Record<string, unknown>>>
  ): Promise<StageGateResult> {
    const hasSnapshot = (name: string): boolean => snapshots.includes(name);
    const hasAnySnapshot = (...names: string[]): boolean => names.some((name) => hasSnapshot(name));
    const hasLog = (name: string): boolean => (logs[name]?.length ?? 0) > 0;
    const runtimeKinds = new Set((logs['runtime-evidence'] ?? []).map((entry) => entry.kind).filter(Boolean));
    const acceptancePassed = await this.acceptancePassed(taskId);

    switch (stage) {
      case 'observe':
        return this.result(stage, hasAnySnapshot('analyze-target-summary') || hasLog('runtime-evidence'), {
          missing: ['analyze-target-summary or runtime-evidence'],
          next: ['Run analyze_target or record runtime evidence.'],
          reasons: [`Observed evidence kinds: ${Array.from(runtimeKinds).join(', ') || '(none)'}.`]
        });
      case 'capture':
        return this.result(stage, hasLog('network') || hasLog('hooks') || hasAnySnapshot('run/frozen-sample', 'run/fixtures', 'analyze-target-summary'), {
          missing: ['network/hooks log or captured fixture snapshot'],
          next: ['Collect code, hook/network samples, or save a fixture.'],
          reasons: [`Network logs: ${logs.network?.length ?? 0}, hook logs: ${logs.hooks?.length ?? 0}.`]
        });
      case 'rebuild':
        return this.result(stage, hasAnySnapshot('rebuild-bundle', 'rebuild-run'), {
          missing: ['rebuild-bundle', 'rebuild-run'],
          next: ['Run run_rebuild_workflow or export_rebuild_bundle then run_rebuild_probe.'],
          reasons: ['Rebuild requires a bundle/run artifact.']
        });
      case 'patch':
        return this.result(stage, acceptancePassed && await this.rebuildOrPatchResolved(taskId), {
          missing: ['latest-acceptance passed', 'matched rebuild/patch comparison'],
          next: ['Run patch/rebuild workflow until divergence is resolved, then mark_acceptance passed.'],
          reasons: [`Acceptance passed: ${acceptancePassed}.`]
        });
      case 'pure':
        return this.result(stage, await this.purePassed(taskId, snapshots), {
          missing: ['run/frozen-sample', 'run/pure-boundary', 'run/fixtures', 'run/node-pure', 'run/pure-verification ok'],
          next: ['Run run_pure_workflow after patch gate is satisfied.'],
          reasons: ['Pure gate checks frozen sample, boundary, fixture, Node scaffold, and verification.']
        });
      case 'port':
        return this.result(stage, await this.portPassed(taskId, snapshots), {
          missing: ['run/python-pure', 'run/python-verification ok', 'run/cross-language-diff matched'],
          next: ['Run run_port_workflow after pure gate is satisfied.'],
          reasons: ['Port gate checks Python scaffold, verification, and cross-language diff.']
        });
      case 'delivery':
        return this.result(stage, await this.deliveryPassed(taskId, snapshots), {
          missing: ['latest-baseline', 'run/regression-run matched', 'delivery/sdk-package'],
          next: ['Register a regression baseline, run regression, and export an SDK package.'],
          reasons: ['Delivery gate requires baseline, regression pass, and SDK package.']
        });
    }
  }

  private result(
    stage: ReverseStage,
    passed: boolean,
    input: {
      reasons: string[];
      missing: string[];
      next: string[];
    }
  ): StageGateResult {
    return {
      checkedAt: new Date().toISOString(),
      missingArtifacts: passed ? [] : input.missing,
      nextActions: passed ? [`${stage} gate passed.`] : input.next,
      passed,
      reasons: input.reasons,
      stage
    };
  }

  private async readLogs(taskId: string): Promise<Record<string, Array<Record<string, unknown>>>> {
    const names = await this.deps.evidenceStore.listLogs(taskId);
    const entries = await Promise.all(names.map(async (name) => [
      name,
      await this.deps.evidenceStore.readLog(taskId, name)
    ] as const));
    return Object.fromEntries(entries);
  }

  private async acceptancePassed(taskId: string): Promise<boolean> {
    const latest = await this.deps.evidenceStore.readSnapshot(taskId, 'latest-acceptance').catch(() => undefined);
    if (isRecord(latest) && latest.status === 'passed') {
      return true;
    }

    const logs = await this.deps.evidenceStore.readLog(taskId, 'acceptance').catch(() => []);
    return logs.some((entry) => entry.status === 'passed' || entry.acceptance && isRecord(entry.acceptance) && entry.acceptance.status === 'passed');
  }

  private async rebuildOrPatchResolved(taskId: string): Promise<boolean> {
    const patchWorkflow = await this.deps.evidenceStore.readSnapshot(taskId, 'patch-workflow').catch(() => undefined);
    if (isRecord(patchWorkflow) && patchWorkflow.readyForPureExtraction === true) {
      return true;
    }

    const patchIteration = await this.deps.evidenceStore.readSnapshot(taskId, 'patch-iteration').catch(() => undefined);
    if (isRecord(patchIteration) && isRecord(patchIteration.divergenceProgress) && patchIteration.divergenceProgress.resolved === true) {
      return true;
    }

    const comparison = await this.deps.evidenceStore.readSnapshot(taskId, 'divergence').catch(() => undefined);
    return isRecord(comparison) && comparison.matched === true;
  }

  private async purePassed(taskId: string, snapshots: string[]): Promise<boolean> {
    const required = ['run/frozen-sample', 'run/pure-boundary', 'run/fixtures', 'run/node-pure', 'run/pure-verification'];
    if (!required.every((name) => snapshots.includes(name))) {
      return false;
    }

    const verification = await this.deps.evidenceStore.readSnapshot(taskId, 'run/pure-verification').catch(() => undefined);
    return isRecord(verification) && verification.ok === true;
  }

  private async portPassed(taskId: string, snapshots: string[]): Promise<boolean> {
    const required = ['run/python-pure', 'run/python-verification', 'run/cross-language-diff'];
    if (!required.every((name) => snapshots.includes(name))) {
      return false;
    }

    const verification = await this.deps.evidenceStore.readSnapshot(taskId, 'run/python-verification').catch(() => undefined);
    const diff = await this.deps.evidenceStore.readSnapshot(taskId, 'run/cross-language-diff').catch(() => undefined);
    return isRecord(verification) && verification.ok === true && isRecord(diff) && diff.matched === true;
  }

  private async deliveryPassed(taskId: string, snapshots: string[]): Promise<boolean> {
    if (!snapshots.includes('latest-baseline') || !snapshots.includes('run/regression-run') || !snapshots.includes('delivery/sdk-package')) {
      return false;
    }

    const regression = await this.deps.evidenceStore.readSnapshot(taskId, 'run/regression-run').catch(() => undefined);
    return isRecord(regression) && regression.matchedBaseline === true;
  }
}
