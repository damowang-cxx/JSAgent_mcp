import { AppError } from '../core/errors.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { AcceptanceRecorder } from '../patch/AcceptanceRecorder.js';
import type { PatchIterationResult, PatchWorkflowResult } from '../patch/types.js';
import type { DivergenceComparisonResult, RuntimeFixture } from '../rebuild/types.js';
import type { AnalyzeTargetRunner } from '../workflow/AnalyzeTargetRunner.js';
import type { PatchWorkflowRunner } from '../workflow/PatchWorkflowRunner.js';
import type { RebuildWorkflowRunner } from '../workflow/RebuildWorkflowRunner.js';
import type { FixtureExtractor } from '../rebuild/FixtureExtractor.js';
import type { FrozenRuntimeSample, PureSource } from './types.js';

export class FreezeManager {
  constructor(
    private readonly deps: {
      evidenceStore: EvidenceStore;
      patchWorkflowRunner: PatchWorkflowRunner;
      rebuildWorkflowRunner: RebuildWorkflowRunner;
      fixtureExtractor: FixtureExtractor;
      analyzeTargetRunner: AnalyzeTargetRunner;
      acceptanceRecorder: AcceptanceRecorder;
    }
  ) {}

  async freeze(options: {
    taskId?: string;
    source?: PureSource;
  }): Promise<FrozenRuntimeSample> {
    const source = options.source ?? 'patch-last';
    const gate = await this.readGate(options.taskId);
    if (!gate.acceptancePassed || !gate.patchGatePassed) {
      throw new AppError('PURE_EXTRACTION_GATE_NOT_SATISFIED', 'PureExtraction requires passed acceptance and a matched/resolved rebuild or patch gate.', {
        acceptancePassed: gate.acceptancePassed,
        patchGatePassed: gate.patchGatePassed,
        source
      });
    }

    const fixture = await this.resolveFixture(source, options.taskId);
    const sample: FrozenRuntimeSample = {
      acceptance: gate.acceptance
        ? {
            recordedAt: gate.acceptance.recordedAt,
            status: gate.acceptance.status
          }
        : null,
      createdAt: new Date().toISOString(),
      hookSamples: fixture.hookSamples,
      notes: [
        'Frozen sample is the truth source for PureExtraction.',
        `Gate source: ${gate.sourceNote}`,
        ...(fixture.notes ?? [])
      ],
      page: fixture.page,
      requestSample: fixture.requestSamples[0] ?? null,
      source,
      taskId: options.taskId ?? null
    };

    if (options.taskId) {
      await this.deps.evidenceStore.openTask({ taskId: options.taskId });
      await this.deps.evidenceStore.writeSnapshot(options.taskId, 'run/frozen-sample', sample);
    }

    return sample;
  }

  private async readGate(taskId?: string): Promise<{
    acceptance: Awaited<ReturnType<AcceptanceRecorder['latest']>> | null;
    acceptancePassed: boolean;
    patchGatePassed: boolean;
    sourceNote: string;
  }> {
    const patchWorkflow = await this.readPatchWorkflow(taskId);
    const rebuildWorkflow = this.deps.rebuildWorkflowRunner.getLastRebuildWorkflowResult();
    const rebuildComparison = taskId ? await this.readRebuildComparison(taskId) : null;
    const patchIteration = taskId ? await this.readPatchIteration(taskId) : null;
    const acceptance = taskId
      ? await this.deps.acceptanceRecorder.latest(taskId)
      : patchWorkflow?.latestAcceptance ?? null;
    const latestIteration = patchWorkflow?.patchIterations.at(-1) ?? null;
    const patchGatePassed = Boolean(
      patchWorkflow?.readyForPureExtraction ||
      patchWorkflow?.rebuild?.comparison.matched ||
      latestIteration?.divergenceProgress.resolved ||
      patchIteration?.divergenceProgress.resolved ||
      rebuildWorkflow?.comparison.matched ||
      rebuildComparison?.matched
    );

    return {
      acceptance,
      acceptancePassed: acceptance?.status === 'passed',
      patchGatePassed,
      sourceNote: patchWorkflow
        ? 'patch workflow result'
        : rebuildWorkflow
          ? 'latest rebuild workflow result'
          : rebuildComparison
            ? 'rebuild comparison artifact'
            : patchIteration
              ? 'patch iteration artifact'
              : 'no patch/rebuild workflow state'
    };
  }

  private async readPatchWorkflow(taskId?: string): Promise<PatchWorkflowResult | null> {
    const cached = this.deps.patchWorkflowRunner.getLastPatchWorkflowResult();
    if (cached) {
      return cached;
    }

    if (!taskId) {
      return null;
    }

    try {
      const snapshot = await this.deps.evidenceStore.readSnapshot(taskId, 'patch-workflow');
      return isRecord(snapshot) ? snapshot as unknown as PatchWorkflowResult : null;
    } catch {
      return null;
    }
  }

  private async readRebuildComparison(taskId: string): Promise<DivergenceComparisonResult | null> {
    try {
      const snapshot = await this.deps.evidenceStore.readSnapshot(taskId, 'divergence');
      return isRecord(snapshot) && typeof snapshot.matched === 'boolean'
        ? snapshot as unknown as DivergenceComparisonResult
        : null;
    } catch {
      return null;
    }
  }

  private async readPatchIteration(taskId: string): Promise<PatchIterationResult | null> {
    try {
      const snapshot = await this.deps.evidenceStore.readSnapshot(taskId, 'patch-iteration');
      return isRecord(snapshot) && typeof snapshot.iterationId === 'string'
        ? snapshot as unknown as PatchIterationResult
        : null;
    } catch {
      return null;
    }
  }

  private async resolveFixture(source: PureSource, taskId?: string): Promise<RuntimeFixture> {
    const lastAnalyze = this.deps.analyzeTargetRunner.getLastAnalyzeTargetResult();

    if (source === 'analyze-target-last' && lastAnalyze) {
      return this.deps.fixtureExtractor.extractFromAnalyzeTargetResult(lastAnalyze);
    }

    if (source === 'patch-last') {
      const rebuild = this.deps.rebuildWorkflowRunner.getLastRebuildWorkflowResult();
      if (rebuild?.fixture) {
        return rebuild.fixture;
      }
      if (taskId) {
        const snapshot = await this.deps.evidenceStore.readSnapshot(taskId, 'fixture').catch(() => undefined);
        if (isRecord(snapshot)) {
          return snapshot as unknown as RuntimeFixture;
        }
      }
      if (lastAnalyze) {
        return this.deps.fixtureExtractor.extractFromAnalyzeTargetResult(lastAnalyze);
      }
    }

    return this.deps.fixtureExtractor.extractFromCurrentPage({
      analyzeTargetResult: lastAnalyze
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
