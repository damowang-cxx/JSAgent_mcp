import { AppError } from '../core/errors.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import { ArtifactIndex } from './ArtifactIndex.js';
import { createDefaultManifest, emptyStageState, highestPassedStage, nowIso } from './state.js';
import type { ArtifactPointer, ReverseStage, TaskManifest, TaskStageState } from './types.js';

function isManifest(value: unknown): value is TaskManifest {
  return value !== null && typeof value === 'object' && 'taskId' in value && 'latestPointers' in value;
}

export class TaskManifestManager {
  private readonly artifactIndex: ArtifactIndex;

  constructor(private readonly evidenceStore: EvidenceStore) {
    this.artifactIndex = new ArtifactIndex(evidenceStore);
  }

  async ensureTask(taskId: string, input?: { targetUrl?: string; goal?: string }): Promise<TaskManifest> {
    const opened = await this.evidenceStore.openTask({
      goal: input?.goal,
      targetUrl: input?.targetUrl,
      taskId
    });
    const existing = await this.readManifest(taskId);
    const descriptor = opened.descriptor;
    const manifest = existing
      ? {
          ...existing,
          goal: input?.goal ?? descriptor.goal ?? existing.goal,
          targetUrl: input?.targetUrl ?? descriptor.targetUrl ?? existing.targetUrl,
          updatedAt: nowIso()
        }
      : createDefaultManifest({
          createdAt: descriptor.createdAt,
          goal: input?.goal ?? descriptor.goal,
          targetUrl: input?.targetUrl ?? descriptor.targetUrl,
          taskId
        });

    return await this.writeManifest(await this.refreshPointers(manifest));
  }

  async getTask(taskId: string): Promise<TaskManifest | null> {
    const existing = await this.readManifest(taskId);
    if (existing) {
      return await this.writeManifest(await this.refreshPointers(existing));
    }

    const descriptor = await this.evidenceStore.readTaskDescriptor(taskId);
    if (!descriptor) {
      return null;
    }

    return await this.ensureTask(taskId, {
      goal: descriptor.goal,
      targetUrl: descriptor.targetUrl
    });
  }

  async updatePointers(taskId: string, patch: Partial<TaskManifest['latestPointers']>): Promise<TaskManifest> {
    const manifest = await this.requireManifest(taskId);
    return await this.writeManifest({
      ...manifest,
      latestPointers: {
        ...manifest.latestPointers,
        ...patch
      },
      updatedAt: nowIso()
    });
  }

  async updateStageState(taskId: string, stage: ReverseStage, state: TaskStageState): Promise<TaskManifest> {
    const manifest = await this.requireManifest(taskId);
    const nextManifest = {
      ...manifest,
      currentStage: state.status === 'passed' ? highestPassedStage({
        ...manifest.stageState,
        [stage]: state
      }) : manifest.currentStage,
      stageState: {
        ...manifest.stageState,
        [stage]: state
      },
      updatedAt: nowIso()
    };
    return await this.writeManifest(nextManifest);
  }

  async setCurrentStage(taskId: string, stage: ReverseStage): Promise<TaskManifest> {
    const manifest = await this.requireManifest(taskId);
    return await this.writeManifest({
      ...manifest,
      currentStage: stage,
      updatedAt: nowIso()
    });
  }

  async buildArtifactIndex(taskId: string): Promise<ArtifactPointer[]> {
    return await this.artifactIndex.build(taskId);
  }

  async markGate(taskId: string, stage: ReverseStage, passed: boolean, reason: string): Promise<TaskManifest> {
    return await this.updateStageState(taskId, stage, emptyStageState(passed ? 'passed' : 'blocked', reason));
  }

  private async requireManifest(taskId: string): Promise<TaskManifest> {
    const manifest = await this.getTask(taskId);
    if (!manifest) {
      throw new AppError('TASK_NOT_FOUND', `Task manifest not found: ${taskId}`, { taskId });
    }
    return manifest;
  }

  private async readManifest(taskId: string): Promise<TaskManifest | null> {
    try {
      const snapshot = await this.evidenceStore.readSnapshot(taskId, 'task-manifest');
      return isManifest(snapshot) ? snapshot : null;
    } catch {
      return null;
    }
  }

  private async writeManifest(manifest: TaskManifest): Promise<TaskManifest> {
    const normalized = await this.refreshPointers({
      ...manifest,
      currentStage: highestPassedStage(manifest.stageState),
      updatedAt: nowIso()
    });
    await this.evidenceStore.writeSnapshot(normalized.taskId, 'task-manifest', normalized);
    return normalized;
  }

  private async refreshPointers(manifest: TaskManifest): Promise<TaskManifest> {
    let snapshots: string[] = [];
    try {
      snapshots = await this.evidenceStore.listSnapshots(manifest.taskId);
    } catch {
      snapshots = [];
    }

    const pointer = (name: string): string | null => snapshots.includes(name) ? name : null;
    return {
      ...manifest,
      latestPointers: {
        analyzeTarget: pointer('analyze-target-summary') ?? manifest.latestPointers.analyzeTarget ?? null,
        acceptance: pointer('latest-acceptance') ?? manifest.latestPointers.acceptance ?? null,
        baseline: pointer('latest-baseline') ?? manifest.latestPointers.baseline ?? null,
        deliveryBundle: pointer('delivery/bundle') ?? manifest.latestPointers.deliveryBundle ?? null,
        deliverySmoke: pointer('delivery/smoke') ?? manifest.latestPointers.deliverySmoke ?? null,
        patchWorkflow: pointer('patch-workflow') ?? manifest.latestPointers.patchWorkflow ?? null,
        portWorkflow: pointer('run/port-workflow') ?? manifest.latestPointers.portWorkflow ?? null,
        pureWorkflow: pointer('run/pure-extraction') ?? manifest.latestPointers.pureWorkflow ?? null,
        regressionRun: pointer('run/regression-run') ?? manifest.latestPointers.regressionRun ?? null,
        rebuildWorkflow: pointer('rebuild-run') ?? pointer('rebuild-bundle') ?? manifest.latestPointers.rebuildWorkflow ?? null,
        scenarioAnalysis: pointer('scenario/analysis') ?? manifest.latestPointers.scenarioAnalysis ?? null,
        scenarioCapture: pointer('scenario/capture/result') ?? manifest.latestPointers.scenarioCapture ?? null,
        scenarioWorkflow: pointer('scenario/workflow') ??
          (manifest.latestPointers.scenarioWorkflow === 'scenario/analysis' ? null : manifest.latestPointers.scenarioWorkflow ?? null),
        helperBoundary: pointer('helper-boundary/latest') ?? manifest.latestPointers.helperBoundary ?? null,
        dependencyWindow: pointer('dependency-window/latest') ?? manifest.latestPointers.dependencyWindow ?? null,
        scenarioProbe: pointer('scenario-probe/latest') ?? manifest.latestPointers.scenarioProbe ?? null,
        boundaryFixture: pointer('boundary-fixture/latest') ?? manifest.latestPointers.boundaryFixture ?? null,
        scenarioPatchHints: pointer('scenario-patch-hints/latest') ?? manifest.latestPointers.scenarioPatchHints ?? null,
        debuggerBreakpoints: pointer('debugger/breakpoints-latest') ?? manifest.latestPointers.debuggerBreakpoints ?? null,
        debuggerPaused: pointer('debugger/paused-last') ?? manifest.latestPointers.debuggerPaused ?? null,
        debuggerInspection: pointer('debugger/inspection-last') ?? manifest.latestPointers.debuggerInspection ?? null,
        compareAnchor: pointer('compare-anchor/latest') ?? manifest.latestPointers.compareAnchor ?? null,
        patchPreflight: pointer('patch-preflight/latest') ?? manifest.latestPointers.patchPreflight ?? null,
        rebuildContext: pointer('rebuild-context/latest') ?? manifest.latestPointers.rebuildContext ?? null,
        flowReasoning: pointer('flow-reasoning/latest') ?? manifest.latestPointers.flowReasoning ?? null,
        purePreflight: pointer('pure-preflight/latest') ?? manifest.latestPointers.purePreflight ?? null,
        sdkPackage: pointer('delivery/sdk-package') ?? manifest.latestPointers.sdkPackage ?? null,
        upgradeWorkflow: pointer('run/upgrade-workflow') ?? manifest.latestPointers.upgradeWorkflow ?? null
      }
    };
  }
}
