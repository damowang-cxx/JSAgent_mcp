import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { RebuildReportBuilder } from '../report/RebuildReportBuilder.js';
import type { DivergenceComparator } from '../rebuild/DivergenceComparator.js';
import type { FixtureExtractor } from '../rebuild/FixtureExtractor.js';
import type { PatchAdvisor } from '../rebuild/PatchAdvisor.js';
import type { RebuildBundleExporter } from '../rebuild/RebuildBundleExporter.js';
import type { RebuildRunner } from '../rebuild/RebuildRunner.js';
import type { RebuildWorkflowOptions, RebuildWorkflowResult, RuntimeFixture } from '../rebuild/types.js';
import type { AnalyzeTargetRunner } from './AnalyzeTargetRunner.js';

export class RebuildWorkflowRunner {
  private lastResult: RebuildWorkflowResult | null = null;

  constructor(
    private readonly deps: {
      browserSession: BrowserSessionManager;
      evidenceStore: EvidenceStore;
      fixtureExtractor: FixtureExtractor;
      rebuildBundleExporter: RebuildBundleExporter;
      rebuildRunner: RebuildRunner;
      divergenceComparator: DivergenceComparator;
      patchAdvisor: PatchAdvisor;
      analyzeTargetRunner: AnalyzeTargetRunner;
      rebuildReportBuilder: RebuildReportBuilder;
    }
  ) {}

  async run(options: RebuildWorkflowOptions = {}): Promise<RebuildWorkflowResult> {
    if (options.url) {
      await this.navigateIfRequested(options.url);
    }

    const taskId = options.taskId ?? options.export?.taskId;
    const task = options.writeEvidence && taskId
      ? await this.deps.evidenceStore.openTask({
          goal: options.goal,
          slug: options.taskSlug,
          targetUrl: options.targetUrl ?? options.url,
          taskId
        })
      : null;
    const fixture = await this.extractFixture(options.fixtureSource);
    const bundle = await this.deps.rebuildBundleExporter.export(
      {
        ...options.export,
        includeAccessLogger: options.export?.includeAccessLogger ?? true,
        includeEnvShim: options.export?.includeEnvShim ?? true,
        includeFixture: options.export?.includeFixture ?? true,
        overwrite: options.export?.overwrite ?? true,
        taskId
      },
      fixture
    );
    const run = await this.deps.rebuildRunner.run({
      bundleDir: bundle.bundleDir,
      fixturePath: bundle.fixtureFile ?? undefined,
      timeoutMs: options.run?.timeoutMs,
      envOverrides: options.run?.envOverrides
    });
    const comparison = await this.deps.divergenceComparator.compare({
      fixture: fixture ?? undefined,
      runResult: run
    });
    const patch = await this.deps.patchAdvisor.suggest({
      divergence: comparison.divergence,
      fixture: fixture ?? undefined,
      runResult: run
    });
    const result: RebuildWorkflowResult = {
      bundle,
      comparison,
      fixture,
      nextActions: this.buildNextActions(run, comparison, patch.firstSuggestion ?? null),
      patch,
      run,
      stopIf: this.buildStopIf(comparison),
      task: task
        ? {
            taskDir: task.taskDir,
            taskId: task.taskId
          }
        : null,
      whyTheseSteps: this.buildWhyTheseSteps(run, comparison, patch.firstSuggestion ?? null)
    };

    if (options.writeEvidence && taskId) {
      await this.writeEvidence(taskId, result);
    }

    this.lastResult = result;
    return result;
  }

  getLastRebuildWorkflowResult(): RebuildWorkflowResult | null {
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

  private async extractFixture(source: RebuildWorkflowOptions['fixtureSource']): Promise<RuntimeFixture | null> {
    const lastAnalyze = this.deps.analyzeTargetRunner.getLastAnalyzeTargetResult();
    if (source === 'analyze-target-last' && lastAnalyze) {
      return this.deps.fixtureExtractor.extractFromAnalyzeTargetResult(lastAnalyze);
    }

    try {
      return await this.deps.fixtureExtractor.extractFromCurrentPage({
        analyzeTargetResult: lastAnalyze
      });
    } catch {
      if (lastAnalyze) {
        return this.deps.fixtureExtractor.extractFromAnalyzeTargetResult(lastAnalyze);
      }
      return null;
    }
  }

  private buildNextActions(
    run: RebuildWorkflowResult['run'],
    comparison: RebuildWorkflowResult['comparison'],
    firstSuggestion: RebuildWorkflowResult['patch']['firstSuggestion']
  ): string[] {
    if (comparison.matched) {
      return [
        'Freeze the current fixture and begin pure extraction only after the target behavior is independently verified.',
        'Export a rebuild report and keep the bundle as the current env-pass baseline.'
      ];
    }

    if (firstSuggestion) {
      return [
        `Apply only the first suggested ${firstSuggestion.patchType} patch for ${firstSuggestion.target}, then rerun run_rebuild_probe.`,
        'Compare again and confirm whether the first divergence moved forward before adding another patch.'
      ];
    }

    if (!run.ok) {
      return [
        'Inspect rebuild stderr/stdout and confirm the generated entry file points at the intended target script.',
        'Capture a fresh fixture if the current run does not produce enough evidence for a deterministic patch.'
      ];
    }

    return ['Export a rebuild report and review the remaining mismatch manually.'];
  }

  private buildWhyTheseSteps(
    run: RebuildWorkflowResult['run'],
    comparison: RebuildWorkflowResult['comparison'],
    firstSuggestion: RebuildWorkflowResult['patch']['firstSuggestion']
  ): string[] {
    const reasons = [
      `Rebuild probe ${run.ok ? 'completed successfully' : 'failed or exited with an error'}, so the workflow moved to first-divergence comparison.`,
      comparison.matched
        ? 'No first divergence was found against the available expected/fixture context.'
        : `First divergence is ${comparison.divergence?.kind ?? 'unknown'} at ${comparison.divergence?.path ?? '$'}.`
    ];

    if (firstSuggestion) {
      reasons.push(`Patch advisor produced one first-divergence-centered suggestion for ${firstSuggestion.target}.`);
    }

    return reasons;
  }

  private buildStopIf(comparison: RebuildWorkflowResult['comparison']): string[] {
    return [
      'Stop if there is no first divergence record; capture or rerun before patching.',
      'Stop if a suggested patch would add broad browser emulation instead of the minimal missing contract.',
      ...(comparison.matched ? ['Stop patching because current comparison matched with available evidence.'] : [])
    ];
  }

  private async writeEvidence(taskId: string, result: RebuildWorkflowResult): Promise<void> {
    await this.deps.evidenceStore.appendLog(taskId, 'runtime-evidence', {
      kind: 'rebuild_workflow',
      bundle: result.bundle,
      comparison: result.comparison,
      firstSuggestion: result.patch.firstSuggestion ?? null,
      runOk: result.run.ok
    });
    await this.deps.evidenceStore.writeSnapshot(taskId, 'rebuild-bundle', result.bundle);
    await this.deps.evidenceStore.writeSnapshot(taskId, 'rebuild-run', result.run);
    await this.deps.evidenceStore.writeSnapshot(taskId, 'divergence', result.comparison);
    await this.deps.evidenceStore.writeSnapshot(taskId, 'patch-suggestions', result.patch);
    if (result.fixture) {
      await this.deps.evidenceStore.writeSnapshot(taskId, 'fixture', result.fixture);
    }
    const report = await this.deps.rebuildReportBuilder.build(result, 'markdown');
    await this.deps.evidenceStore.writeSnapshot(taskId, 'rebuild-report-markdown', report);
  }
}
