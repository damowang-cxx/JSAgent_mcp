import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { RebuildReportBuilder } from '../report/RebuildReportBuilder.js';
import type { RebuildContext } from '../rebuild-integration/types.js';
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
    const contextUsed = options.rebuildContext ?? null;
    const fixture = await this.extractFixture(options.fixtureSource, contextUsed);
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
    if (contextUsed) {
      comparison.notes.push(
        `Rebuild context ${contextUsed.contextId} selected fixtureSource=${contextUsed.fixtureSource}.`,
        contextUsed.usedCompareAnchor
          ? `Compare anchor metadata is ${contextUsed.usedCompareAnchor.label} (${contextUsed.usedCompareAnchor.kind}, ${contextUsed.usedCompareAnchor.compareStrategy}).`
          : 'No compare anchor metadata was attached to this rebuild context.'
      );
    }
    const patch = await this.deps.patchAdvisor.suggest({
      divergence: comparison.divergence,
      fixture: fixture ?? undefined,
      runResult: run
    });
    const result: RebuildWorkflowResult = {
      bundle,
      comparison,
      contextUsed,
      excludedNoise: contextUsed?.excludedNoise ?? [],
      expectedOutputs: contextUsed?.expectedOutputs ?? [],
      expectedOutputsSource: contextUsed
        ? contextUsed.expectedOutputs.length > 0
          ? contextUsed.fixtureSource
          : null
        : null,
      fixture,
      nextActions: this.buildNextActions(run, comparison, patch.firstSuggestion ?? null, contextUsed),
      patch,
      preservedInputs: contextUsed?.preservedInputs ?? [],
      preservedInputsSource: contextUsed
        ? contextUsed.preservedInputs.length > 0
          ? contextUsed.fixtureSource
          : null
        : null,
      run,
      stopIf: this.buildStopIf(comparison, contextUsed),
      task: task
        ? {
            taskDir: task.taskDir,
            taskId: task.taskId
          }
        : null,
      usedCompareAnchor: contextUsed?.usedCompareAnchor ?? null,
      usedPatchPreflight: contextUsed?.usedPatchPreflight ?? null,
      whyTheseSteps: this.buildWhyTheseSteps(run, comparison, patch.firstSuggestion ?? null, contextUsed)
    };

    if (options.writeEvidence && taskId) {
      await this.writeEvidence(taskId, result);
    }

    this.lastResult = result;
    return result;
  }

  async runWithContext(
    options: Omit<RebuildWorkflowOptions, 'rebuildContext'> & {
      rebuildContext: RebuildContext;
    }
  ): Promise<RebuildWorkflowResult> {
    return await this.run({
      ...options,
      fixtureSource: options.fixtureSource ?? 'rebuild-context-last',
      rebuildContext: options.rebuildContext
    });
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

  private async extractFixture(
    source: RebuildWorkflowOptions['fixtureSource'],
    context: RebuildContext | null
  ): Promise<RuntimeFixture | null> {
    if (context && (source === 'rebuild-context-last' || source === 'boundary-fixture-last' || source === 'task-artifact')) {
      return this.fixtureFromContext(context);
    }

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
    firstSuggestion: RebuildWorkflowResult['patch']['firstSuggestion'],
    context: RebuildContext | null
  ): string[] {
    const contextActions = context
      ? [
          ...context.nextActions.slice(0, 4),
          context.usedCompareAnchor
            ? `Keep ${context.usedCompareAnchor.label} as the first compare anchor before expanding comparison scope.`
            : 'Select a compare anchor before treating this rebuild as patch-ready.',
          context.usedPatchPreflight
            ? `Apply patch decisions only after checking preflight surface ${context.usedPatchPreflight.surface}:${context.usedPatchPreflight.target}.`
            : 'Plan patch preflight before running a patch iteration.'
        ]
      : [];

    if (comparison.matched) {
      return [
        ...contextActions,
        'Freeze the current fixture and begin pure extraction only after the target behavior is independently verified.',
        'Export a rebuild report and keep the bundle as the current env-pass baseline.'
      ];
    }

    if (firstSuggestion) {
      return [
        ...contextActions,
        `Apply only the first suggested ${firstSuggestion.patchType} patch for ${firstSuggestion.target}, then rerun run_rebuild_probe.`,
        'Compare again and confirm whether the first divergence moved forward before adding another patch.'
      ];
    }

    if (!run.ok) {
      return [
        ...contextActions,
        'Inspect rebuild stderr/stdout and confirm the generated entry file points at the intended target script.',
        'Capture a fresh fixture if the current run does not produce enough evidence for a deterministic patch.'
      ];
    }

    return [...contextActions, 'Export a rebuild report and review the remaining mismatch manually.'];
  }

  private buildWhyTheseSteps(
    run: RebuildWorkflowResult['run'],
    comparison: RebuildWorkflowResult['comparison'],
    firstSuggestion: RebuildWorkflowResult['patch']['firstSuggestion'],
    context: RebuildContext | null
  ): string[] {
    const reasons = [
      `Rebuild probe ${run.ok ? 'completed successfully' : 'failed or exited with an error'}, so the workflow moved to first-divergence comparison.`,
      comparison.matched
        ? 'No first divergence was found against the available expected/fixture context.'
        : `First divergence is ${comparison.divergence?.kind ?? 'unknown'} at ${comparison.divergence?.path ?? '$'}.`
    ];

    if (context) {
      reasons.push(
        `This run consumed rebuild context ${context.contextId} from ${context.fixtureSource}.`,
        context.usedCompareAnchor
          ? `Context compare anchor is ${context.usedCompareAnchor.label}; this keeps comparison focused before whole-object diff.`
          : 'Context did not include a compare anchor, so compare-anchor selection remains a required follow-up.',
        context.usedPatchPreflight
          ? `Context patch preflight surface is ${context.usedPatchPreflight.surface}:${context.usedPatchPreflight.target}.`
          : 'Context did not include patch preflight, so patch iteration should not start yet.'
      );
    }

    if (firstSuggestion) {
      reasons.push(`Patch advisor produced one first-divergence-centered suggestion for ${firstSuggestion.target}.`);
    }

    return reasons;
  }

  private buildStopIf(comparison: RebuildWorkflowResult['comparison'], context: RebuildContext | null): string[] {
    return [
      ...(context?.stopIf.slice(0, 5) ?? []),
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
      contextId: result.contextUsed?.contextId ?? null,
      firstSuggestion: result.patch.firstSuggestion ?? null,
      runOk: result.run.ok
    });
    if (result.contextUsed) {
      await this.deps.evidenceStore.appendLog(taskId, 'runtime-evidence', {
        kind: 'rebuild_context',
        contextId: result.contextUsed.contextId,
        fixtureSource: result.contextUsed.fixtureSource,
        usedCompareAnchor: result.contextUsed.usedCompareAnchor ?? null,
        usedPatchPreflight: result.contextUsed.usedPatchPreflight ?? null
      });
      await this.deps.evidenceStore.writeSnapshot(taskId, 'rebuild-context/latest', {
        createdAt: new Date().toISOString(),
        result: result.contextUsed,
        taskId
      });
    }
    await this.deps.evidenceStore.writeSnapshot(taskId, 'rebuild-workflow', result);
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

  private fixtureFromContext(context: RebuildContext): RuntimeFixture {
    const headers: Record<string, string> = {};
    for (const output of context.expectedOutputs.filter((item) => item.target === 'header').slice(0, 20)) {
      headers[output.name] = '<expected-output>';
    }

    const bodyOutputs = context.expectedOutputs
      .filter((item) => item.target === 'body-field' || item.target === 'request-param' || item.target === 'request-field')
      .slice(0, 20)
      .map((item) => item.name);

    const anchor = context.usedCompareAnchor;
    return {
      createdAt: new Date().toISOString(),
      hookSamples: [],
      notes: [
        `Fixture synthesized from rebuild context ${context.contextId}.`,
        `Original fixture source: ${context.fixtureSource}.`,
        ...context.rebuildNotes.slice(0, 10),
        ...context.excludedNoise.slice(0, 10).map((item) => `Excluded noise: ${item}`)
      ],
      page: {
        title: 'Rebuild Context',
        url: anchor?.label ?? context.usedBoundaryFixture?.targetName ?? context.contextId
      },
      requestSamples: [
        {
          headers,
          method: 'CONTEXT',
          postData: bodyOutputs.length > 0
            ? JSON.stringify({
                expectedFields: bodyOutputs
              })
            : null,
          url: anchor?.label ?? context.usedBoundaryFixture?.targetName ?? 'rebuild-context'
        }
      ],
      selectedPriorityTargets: [
        context.usedBoundaryFixture?.targetName,
        anchor?.label,
        context.usedPatchPreflight?.target,
        ...context.expectedOutputs.map((item) => item.name),
        ...context.preservedInputs.map((item) => item.name)
      ].filter((item): item is string => Boolean(item)).slice(0, 30),
      source: context.fixtureSource === 'boundary-fixture' ? 'boundary-fixture' : 'rebuild-context'
    };
  }
}
