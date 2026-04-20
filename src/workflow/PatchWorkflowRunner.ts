import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { AcceptanceRecorder } from '../patch/AcceptanceRecorder.js';
import type { FixtureStabilizer } from '../patch/FixtureStabilizer.js';
import type { PatchLoopRunner } from '../patch/PatchLoopRunner.js';
import type { PatchWorkflowOptions, PatchWorkflowResult } from '../patch/types.js';
import type { PatchReportBuilder } from '../report/PatchReportBuilder.js';
import type { RebuildWorkflowRunner } from './RebuildWorkflowRunner.js';

export class PatchWorkflowRunner {
  private lastResult: PatchWorkflowResult | null = null;

  constructor(
    private readonly deps: {
      browserSession: BrowserSessionManager;
      evidenceStore: EvidenceStore;
      fixtureStabilizer: FixtureStabilizer;
      rebuildWorkflowRunner: RebuildWorkflowRunner;
      patchLoopRunner: PatchLoopRunner;
      acceptanceRecorder: AcceptanceRecorder;
      patchReportBuilder: PatchReportBuilder;
    }
  ) {}

  async run(options: PatchWorkflowOptions = {}): Promise<PatchWorkflowResult> {
    if (options.url) {
      await this.navigateIfRequested(options.url);
    }

    const task = options.writeEvidence && options.taskId
      ? await this.deps.evidenceStore.openTask({
          goal: options.goal,
          slug: options.taskSlug,
          targetUrl: options.targetUrl ?? options.url,
          taskId: options.taskId
        })
      : null;

    const stabilization = options.stabilizeFixture
      ? await this.deps.fixtureStabilizer.stabilize({
          source: options.fixtureSource ?? 'current-page',
          samples: 3
        })
      : null;

    const rebuildResult = await this.ensureRebuild(options);
    const patchIterations = [];
    const iterationCount = Math.max(0, Math.min(options.patchIterations ?? 1, 5));

    for (let index = 0; index < iterationCount; index += 1) {
      const iteration = await this.deps.patchLoopRunner.runIteration({
        autoApplyFirstSuggestion: options.autoApplyFirstSuggestion,
        bundleDir: rebuildResult.bundle.bundleDir,
        fixtureSource: options.fixtureSource,
        run: options.run,
        taskId: options.taskId,
        writeEvidence: options.writeEvidence
      });
      patchIterations.push(iteration);

      if (iteration.divergenceProgress.resolved || iteration.divergenceProgress.unchanged || iteration.divergenceProgress.worsened) {
        break;
      }
    }

    const latestAcceptance = options.taskId ? await this.deps.acceptanceRecorder.latest(options.taskId) : null;
    const readyForPureExtraction = this.isReadyForPureExtraction(
      stabilization?.stability ?? null,
      patchIterations.at(-1) ?? null,
      latestAcceptance,
      rebuildResult.comparison.matched
    );
    const result: PatchWorkflowResult = {
      latestAcceptance,
      nextActions: this.buildNextActions(
        readyForPureExtraction,
        stabilization?.stability ?? null,
        patchIterations.at(-1) ?? null,
        latestAcceptance,
        rebuildResult.comparison.matched
      ),
      patchIterations,
      readyForPureExtraction,
      rebuild: {
        bundle: rebuildResult.bundle,
        comparison: rebuildResult.comparison,
        run: rebuildResult.run
      },
      stability: stabilization?.stability ?? null,
      stopIf: this.buildStopIf(readyForPureExtraction),
      task: task
        ? {
            taskDir: task.taskDir,
            taskId: task.taskId
          }
        : null,
      whyTheseSteps: this.buildWhyTheseSteps(
        stabilization?.stability ?? null,
        patchIterations.at(-1) ?? null,
        latestAcceptance,
        rebuildResult.comparison.matched
      )
    };

    if (options.writeEvidence && options.taskId) {
      await this.writeEvidence(options.taskId, result);
    }

    this.lastResult = result;
    return result;
  }

  getLastPatchWorkflowResult(): PatchWorkflowResult | null {
    return this.lastResult;
  }

  private async navigateIfRequested(url: string): Promise<void> {
    const selectedPage = await this.deps.browserSession.getSelectedPageOrNull();
    if (!selectedPage) {
      await this.deps.browserSession.newPage();
    }
    await this.deps.browserSession.navigateSelectedPage({
      type: 'url',
      url
    });
  }

  private async ensureRebuild(options: PatchWorkflowOptions) {
    const cached = this.deps.rebuildWorkflowRunner.getLastRebuildWorkflowResult();
    if (cached && !options.url) {
      return cached;
    }

    return this.deps.rebuildWorkflowRunner.run({
      export: {
        includeAccessLogger: true,
        includeEnvShim: true,
        includeFixture: true,
        overwrite: true,
        taskId: options.taskId
      },
      fixtureSource: options.fixtureSource,
      goal: options.goal,
      run: options.run,
      targetUrl: options.targetUrl,
      taskId: options.taskId,
      taskSlug: options.taskSlug,
      url: options.url,
      writeEvidence: options.writeEvidence
    });
  }

  private isReadyForPureExtraction(
    stability: PatchWorkflowResult['stability'],
    latestIteration: PatchWorkflowResult['patchIterations'][number] | null,
    latestAcceptance: PatchWorkflowResult['latestAcceptance'],
    rebuildMatched: boolean
  ): boolean {
    const patchGatePassed = latestIteration
      ? latestIteration.divergenceProgress.resolved
      : rebuildMatched;

    return Boolean(
      (stability?.stable ?? true) &&
      patchGatePassed &&
      latestAcceptance?.status === 'passed'
    );
  }

  private buildNextActions(
    readyForPureExtraction: boolean,
    stability: PatchWorkflowResult['stability'],
    latestIteration: PatchWorkflowResult['patchIterations'][number] | null,
    latestAcceptance: PatchWorkflowResult['latestAcceptance'],
    rebuildMatched: boolean
  ): string[] {
    if (readyForPureExtraction) {
      return [
        'Freeze the stabilized fixture and begin pure extraction from the patched rebuild bundle.',
        'Keep the latest acceptance record with the pure-extraction task boundary.'
      ];
    }

    const actions: string[] = [];
    if (stability && !stability.stable) {
      actions.push('Collect another fixture sample before pure extraction because the current fixture drifted.');
    }
    if (!(latestIteration?.divergenceProgress.resolved ?? rebuildMatched)) {
      actions.push('Run another single-patch iteration from the current first divergence.');
    }
    if (latestAcceptance?.status !== 'passed') {
      actions.push('Record a passed acceptance result before declaring the patch phase complete.');
    }
    return actions.length > 0 ? actions : ['Run patch workflow again with autoApplyFirstSuggestion=true when a first-divergence patch is available.'];
  }

  private buildWhyTheseSteps(
    stability: PatchWorkflowResult['stability'],
    latestIteration: PatchWorkflowResult['patchIterations'][number] | null,
    latestAcceptance: PatchWorkflowResult['latestAcceptance'],
    rebuildMatched: boolean
  ): string[] {
    return [
      stability
        ? `Fixture stabilization returned stable=${stability.stable} across ${stability.comparedSamples} samples.`
        : 'Fixture stabilization was not requested for this workflow run.',
      latestIteration
        ? `Latest patch iteration divergence resolved=${latestIteration.divergenceProgress.resolved}, movedForward=${latestIteration.divergenceProgress.movedForward}.`
        : `No patch iteration was executed; rebuild comparison matched=${rebuildMatched}.`,
      latestAcceptance
        ? `Latest acceptance status is ${latestAcceptance.status}.`
        : 'No acceptance record exists yet for this task.'
    ];
  }

  private buildStopIf(readyForPureExtraction: boolean): string[] {
    return [
      'Stop if patch suggestions are not based on the current first divergence.',
      'Stop if acceptance has not passed; pure extraction should not start before acceptance evidence exists.',
      ...(readyForPureExtraction ? ['Stop adding environment patches; current gate is ready for pure extraction.'] : [])
    ];
  }

  private async writeEvidence(taskId: string, result: PatchWorkflowResult): Promise<void> {
    await this.deps.evidenceStore.appendLog(taskId, 'runtime-evidence', {
      kind: 'patch_workflow',
      iterationCount: result.patchIterations.length,
      readyForPureExtraction: result.readyForPureExtraction
    });
    await this.deps.evidenceStore.writeSnapshot(taskId, 'patch-workflow', result);
    const report = await this.deps.patchReportBuilder.buildPatchWorkflow(result, 'markdown');
    await this.deps.evidenceStore.writeSnapshot(taskId, 'patch-report-markdown', report);
  }
}
