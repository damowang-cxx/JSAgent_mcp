import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { AppError } from '../core/errors.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { DivergenceComparator } from '../rebuild/DivergenceComparator.js';
import type { FixtureExtractor } from '../rebuild/FixtureExtractor.js';
import type { PatchAdvisor } from '../rebuild/PatchAdvisor.js';
import type { RebuildRunner } from '../rebuild/RebuildRunner.js';
import type { RebuildRunResult, RuntimeFixture } from '../rebuild/types.js';
import { writeJsonFile } from '../rebuild/serialization.js';
import type { AnalyzeTargetRunner } from '../workflow/AnalyzeTargetRunner.js';
import type { RebuildWorkflowRunner } from '../workflow/RebuildWorkflowRunner.js';
import { compareDivergenceProgress } from './divergenceTracking.js';
import type { PatchApplier } from './PatchApplier.js';
import type { PatchPlanManager } from './PatchPlanManager.js';
import type { PatchIterationResult } from './types.js';

export class PatchLoopRunner {
  private lastIteration: PatchIterationResult | null = null;

  constructor(
    private readonly deps: {
      evidenceStore: EvidenceStore;
      fixtureExtractor: FixtureExtractor;
      analyzeTargetRunner: AnalyzeTargetRunner;
      rebuildWorkflowRunner: RebuildWorkflowRunner;
      rebuildRunner: RebuildRunner;
      divergenceComparator: DivergenceComparator;
      patchAdvisor: PatchAdvisor;
      patchPlanManager: PatchPlanManager;
      patchApplier: PatchApplier;
    }
  ) {}

  async runIteration(options: {
    taskId?: string;
    bundleDir?: string;
    fixtureSource?: 'current-page' | 'analyze-target-last';
    expected?: unknown;
    run?: {
      timeoutMs?: number;
      envOverrides?: Record<string, unknown>;
    };
    autoApplyFirstSuggestion?: boolean;
    writeEvidence?: boolean;
  }): Promise<PatchIterationResult> {
    const startedAt = new Date();
    const lastRebuild = this.deps.rebuildWorkflowRunner.getLastRebuildWorkflowResult();
    const bundleDir = options.bundleDir ?? lastRebuild?.bundle.bundleDir;
    if (!bundleDir) {
      throw new AppError('REBUILD_BUNDLE_NOT_AVAILABLE', 'No bundleDir was provided and no rebuild workflow result is cached.');
    }
    const bundle = options.bundleDir && options.bundleDir !== lastRebuild?.bundle.bundleDir
      ? {
          bundleDir,
          entryFile: path.join(bundleDir, 'entry.js'),
          fixtureFile: null,
          metadataFile: path.join(bundleDir, 'metadata.json'),
          targetFiles: [],
          taskId: options.taskId ?? null,
          warnings: ['Patch iteration was started from an explicit bundleDir without cached bundle metadata.']
        }
      : lastRebuild!.bundle;

    const fixture = await this.extractFixture(options.fixtureSource);
    const fixturePath = await this.resolveFixturePath(bundleDir, bundle.fixtureFile ?? null, fixture);
    const effectiveBundle = fixturePath && !bundle.fixtureFile
      ? {
          ...bundle,
          fixtureFile: fixturePath
        }
      : bundle;
    const initialRun = await this.deps.rebuildRunner.run({
      bundleDir,
      envOverrides: options.run?.envOverrides,
      fixturePath: fixturePath ?? undefined,
      timeoutMs: options.run?.timeoutMs
    });
    const initialComparison = await this.deps.divergenceComparator.compare({
      expected: options.expected,
      fixture: fixture ?? undefined,
      runResult: initialRun
    });
    const patchAdvice = await this.deps.patchAdvisor.suggest({
      divergence: initialComparison.divergence,
      fixture: fixture ?? undefined,
      runResult: initialRun
    });
    const patchPlan = await this.deps.patchPlanManager.createPlan({
      divergence: initialComparison.divergence,
      notes: ['Patch plan is based on the current first divergence before any patch is applied.'],
      suggestions: patchAdvice.suggestions,
      taskId: options.taskId
    });

    let finalRun: RebuildRunResult = initialRun;
    let finalComparison = initialComparison;
    let appliedPatch: PatchIterationResult['appliedPatch'] = null;

    const firstSuggestion = patchAdvice.firstSuggestion ?? null;
    if (options.autoApplyFirstSuggestion && firstSuggestion?.suggestedCode) {
      appliedPatch = await this.deps.patchApplier.apply({
        bundleDir,
        planId: patchPlan.planId,
        suggestion: firstSuggestion,
        taskId: options.taskId
      });
      await this.deps.patchPlanManager.markApplied(patchPlan.planId, firstSuggestion);
      await this.deps.patchPlanManager.recordApplied(appliedPatch);

      finalRun = await this.deps.rebuildRunner.run({
        bundleDir,
        envOverrides: options.run?.envOverrides,
        fixturePath: fixturePath ?? undefined,
        timeoutMs: options.run?.timeoutMs
      });
      finalComparison = await this.deps.divergenceComparator.compare({
        expected: options.expected,
        fixture: fixture ?? undefined,
        runResult: finalRun
      });
    }

    const divergenceProgress = compareDivergenceProgress(initialComparison.divergence, finalComparison.divergence);
    const result: PatchIterationResult = {
      appliedPatch,
      bundle: effectiveBundle,
      comparison: finalComparison,
      divergenceProgress,
      endedAt: new Date().toISOString(),
      iterationId: `patch-iteration-${randomUUID()}`,
      nextActions: this.buildNextActions(divergenceProgress, appliedPatch, firstSuggestion),
      patchPlan,
      run: finalRun,
      startedAt: startedAt.toISOString(),
      stopIf: this.buildStopIf(divergenceProgress, appliedPatch),
      whyTheseSteps: this.buildWhyTheseSteps(initialRun, finalRun, divergenceProgress, appliedPatch)
    };

    if (options.writeEvidence && options.taskId) {
      await this.writeEvidence(options.taskId, result);
    }

    this.lastIteration = result;
    return result;
  }

  getLastPatchIterationResult(): PatchIterationResult | null {
    return this.lastIteration;
  }

  private async extractFixture(source: 'current-page' | 'analyze-target-last' | undefined): Promise<RuntimeFixture | null> {
    const lastAnalyze = this.deps.analyzeTargetRunner.getLastAnalyzeTargetResult();
    if (source === 'analyze-target-last' && lastAnalyze) {
      return this.deps.fixtureExtractor.extractFromAnalyzeTargetResult(lastAnalyze);
    }

    try {
      return await this.deps.fixtureExtractor.extractFromCurrentPage({
        analyzeTargetResult: lastAnalyze
      });
    } catch {
      return lastAnalyze ? this.deps.fixtureExtractor.extractFromAnalyzeTargetResult(lastAnalyze) : null;
    }
  }

  private async resolveFixturePath(
    bundleDir: string,
    existingFixtureFile: string | null,
    fixture: RuntimeFixture | null
  ): Promise<string | null> {
    if (existingFixtureFile) {
      return existingFixtureFile;
    }

    if (!fixture) {
      return null;
    }

    const fixturePath = path.join(bundleDir, '.jsagent-patch-fixture.json');
    await writeJsonFile(fixturePath, fixture);
    return fixturePath;
  }

  private buildNextActions(
    progress: PatchIterationResult['divergenceProgress'],
    appliedPatch: PatchIterationResult['appliedPatch'],
    firstSuggestion: PatchIterationResult['patchPlan']['selectedSuggestion']
  ): string[] {
    if (progress.resolved) {
      return [
        'Record acceptance evidence before declaring the patch phase complete.',
        'Stabilize the fixture and only then prepare pure extraction inputs.'
      ];
    }

    if (!appliedPatch && firstSuggestion?.suggestedCode) {
      return [
        `Apply only the first patch suggestion for ${firstSuggestion.target}, then rerun run_patch_iteration.`,
        'Do not add a second patch until the first divergence moves or resolves.'
      ];
    }

    if (progress.movedForward) {
      return [
        'Keep the applied patch and generate the next patch plan from the new first divergence.',
        'Rerun one more patch iteration instead of adding unrelated shims.'
      ];
    }

    if (progress.unchanged) {
      return [
        'Do not stack more patches blindly; inspect whether the selected patch was applied to the right bundle.',
        'Capture a fresh fixture or rerun rebuild workflow if the divergence is stale.'
      ];
    }

    return ['Stop patching and inspect the new divergence before applying another patch.'];
  }

  private buildWhyTheseSteps(
    initialRun: RebuildRunResult,
    finalRun: RebuildRunResult,
    progress: PatchIterationResult['divergenceProgress'],
    appliedPatch: PatchIterationResult['appliedPatch']
  ): string[] {
    const reasons = [
      `Initial rebuild probe ${initialRun.ok ? 'produced structured output' : 'failed'}, so patch planning used its first divergence.`,
      appliedPatch
        ? `Applied one patch for ${appliedPatch.target}, then immediately reran the rebuild probe.`
        : 'No patch was applied in this iteration; the result is a plan-only checkpoint.',
      `Final rebuild probe ${finalRun.ok ? 'completed successfully' : 'still failed'}, and divergence status is ${progress.resolved ? 'resolved' : progress.movedForward ? 'moved-forward' : progress.unchanged ? 'unchanged' : progress.worsened ? 'worsened' : 'changed'}.`
    ];
    return reasons;
  }

  private buildStopIf(
    progress: PatchIterationResult['divergenceProgress'],
    appliedPatch: PatchIterationResult['appliedPatch']
  ): string[] {
    return [
      'Stop if the next patch is not derived from the current first divergence.',
      'Stop if the patch would add broad browser emulation instead of the smallest missing contract.',
      ...(appliedPatch && (progress.unchanged || progress.worsened)
        ? ['Stop and inspect the patch target because the first divergence did not move forward.']
        : [])
    ];
  }

  private async writeEvidence(taskId: string, result: PatchIterationResult): Promise<void> {
    await this.deps.evidenceStore.openTask({ taskId });
    await this.deps.evidenceStore.appendLog(taskId, 'runtime-evidence', {
      kind: 'patch_iteration',
      appliedPatch: result.appliedPatch ?? null,
      divergenceProgress: result.divergenceProgress,
      iterationId: result.iterationId
    });
    await this.deps.evidenceStore.writeSnapshot(taskId, 'patch-plan', result.patchPlan);
    await this.deps.evidenceStore.writeSnapshot(taskId, 'patch-iteration', result);
    await this.deps.evidenceStore.writeSnapshot(taskId, 'divergence-progress', result.divergenceProgress);
  }
}
