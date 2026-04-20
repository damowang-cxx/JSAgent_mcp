import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { BoundaryDefiner } from '../pure/BoundaryDefiner.js';
import type { FreezeManager } from '../pure/FreezeManager.js';
import type { PureFixtureBuilder } from '../pure/PureFixtureBuilder.js';
import type { PureNodeExtractor } from '../pure/PureNodeExtractor.js';
import type { PureVerifier } from '../pure/PureVerifier.js';
import type { RuntimeTraceSampler } from '../pure/RuntimeTraceSampler.js';
import type { PureExtractionResult, PureSource } from '../pure/types.js';
import type { RebuildBundleExport } from '../rebuild/types.js';
import type { PureReportBuilder } from '../report/PureReportBuilder.js';
import type { AnalyzeTargetRunner } from './AnalyzeTargetRunner.js';
import type { RebuildWorkflowRunner } from './RebuildWorkflowRunner.js';

export class PureExtractionRunner {
  private lastResult: PureExtractionResult | null = null;

  constructor(
    private readonly deps: {
      evidenceStore: EvidenceStore;
      freezeManager: FreezeManager;
      runtimeTraceSampler: RuntimeTraceSampler;
      boundaryDefiner: BoundaryDefiner;
      pureFixtureBuilder: PureFixtureBuilder;
      pureNodeExtractor: PureNodeExtractor;
      pureVerifier: PureVerifier;
      pureReportBuilder: PureReportBuilder;
      rebuildWorkflowRunner: RebuildWorkflowRunner;
      analyzeTargetRunner: AnalyzeTargetRunner;
    }
  ) {}

  async run(options: {
    taskId?: string;
    source?: PureSource;
    targetFunctionName?: string;
    probeExpressions?: string[];
    traceTimeoutMs?: number;
    verifyTimeoutMs?: number;
    overwrite?: boolean;
    writeEvidence?: boolean;
  }): Promise<PureExtractionResult> {
    const task = options.writeEvidence && options.taskId
      ? await this.deps.evidenceStore.openTask({ taskId: options.taskId })
      : null;
    const frozenSample = await this.deps.freezeManager.freeze({
      source: options.source,
      taskId: options.taskId
    });
    const bundle = await this.resolveRebuildBundle(options.taskId);
    const runtimeTrace = bundle?.bundleDir
      ? await this.deps.runtimeTraceSampler.sample({
          bundleDir: bundle.bundleDir,
          fixturePath: bundle.fixtureFile ?? undefined,
          probeExpressions: options.probeExpressions,
          targetFunctionName: options.targetFunctionName,
          timeoutMs: options.traceTimeoutMs
        })
      : null;
    const boundary = await this.deps.boundaryDefiner.define({
      analyzeTargetSummary: this.deps.analyzeTargetRunner.getLastAnalyzeTargetResult(),
      frozenSample,
      runtimeTrace
    });
    const fixture = await this.deps.pureFixtureBuilder.build({
      boundary,
      frozenSample,
      runtimeTrace
    });
    const nodePure = await this.deps.pureNodeExtractor.extract({
      boundary,
      fixture,
      overwrite: options.overwrite,
      sourceBundleDir: bundle?.bundleDir,
      targetFunctionName: options.targetFunctionName,
      taskId: options.taskId
    });
    const verification = await this.deps.pureVerifier.verify({
      entryFile: nodePure.entryFile,
      fixtureFile: nodePure.fixtureFile,
      timeoutMs: options.verifyTimeoutMs
    });
    const readyForPort = Boolean(
      verification.ok &&
      frozenSample.acceptance?.status === 'passed' &&
      boundary.explicitInputs.length > 0 &&
      boundary.outputs.length > 0 &&
      !fixture.notes.some((note) => /No runtime return value/i.test(note))
    );
    const result: PureExtractionResult = {
      boundary,
      fixture,
      frozenSample,
      nextActions: this.buildNextActions(readyForPort, verification.ok, runtimeTrace),
      nodePure,
      readyForPort,
      runtimeTrace,
      stopIf: this.buildStopIf(readyForPort, verification.ok),
      task: task
        ? {
            taskDir: task.taskDir,
            taskId: task.taskId
          }
        : options.taskId
          ? {
              taskDir: this.deps.evidenceStore.getTaskDir(options.taskId),
              taskId: options.taskId
            }
          : null,
      verification,
      whyTheseSteps: this.buildWhyTheseSteps(runtimeTrace, boundary.explicitInputs.length, verification.ok)
    };

    if (options.writeEvidence && options.taskId) {
      await this.writeEvidence(options.taskId, result);
    }

    this.lastResult = result;
    return result;
  }

  getLastPureExtractionResult(): PureExtractionResult | null {
    return this.lastResult;
  }

  private async resolveRebuildBundle(taskId?: string): Promise<RebuildBundleExport | null> {
    const cached = this.deps.rebuildWorkflowRunner.getLastRebuildWorkflowResult()?.bundle ?? null;
    if (cached) {
      return cached;
    }

    if (!taskId) {
      return null;
    }

    try {
      const snapshot = await this.deps.evidenceStore.readSnapshot(taskId, 'rebuild-bundle');
      return snapshot && typeof snapshot === 'object' && 'bundleDir' in snapshot
        ? snapshot as RebuildBundleExport
        : null;
    } catch {
      return null;
    }
  }

  private buildNextActions(
    readyForPort: boolean,
    verificationOk: boolean,
    runtimeTrace: PureExtractionResult['runtimeTrace']
  ): string[] {
    if (readyForPort) {
      return [
        'Freeze the Node pure scaffold as the port baseline.',
        'Only start Python or another host port after keeping this fixture and verification result with the task.'
      ];
    }

    if (!runtimeTrace || runtimeTrace.records.length === 0) {
      return [
        'Collect a runtime trace from the local rebuild bundle before strengthening the pure implementation.',
        'Do not port yet; boundary outputs are under-observed.'
      ];
    }

    if (!verificationOk) {
      return [
        'Implement computePure against the boundary and rerun verify_node_pure.',
        'If output divergence persists, return to define_pure_boundary or export_runtime_trace before porting.'
      ];
    }

    return ['Review boundary notes before marking the scaffold as ready for external port.'];
  }

  private buildWhyTheseSteps(
    runtimeTrace: PureExtractionResult['runtimeTrace'],
    explicitInputCount: number,
    verificationOk: boolean
  ): string[] {
    return [
      'PureExtraction starts from a frozen accepted sample so fixture output remains stable.',
      runtimeTrace
        ? `Runtime trace collected ${runtimeTrace.records.length} records from local rebuild runtime.`
        : 'No local rebuild runtime trace was available; boundary and fixture are sample-only.',
      `Boundary contains ${explicitInputCount} explicit input labels.`,
      `Node pure verification ${verificationOk ? 'matched' : 'did not match'} the fixture expected output.`
    ];
  }

  private buildStopIf(readyForPort: boolean, verificationOk: boolean): string[] {
    return [
      'Stop if patch gate or acceptance evidence is missing.',
      'Stop if the boundary has no explicit inputs or no observed output.',
      ...(verificationOk ? [] : ['Stop porting; fix Node pure verification before Python or other host ports.']),
      ...(readyForPort ? ['Stop collecting more browser noise; this result is ready to become the port baseline.'] : [])
    ];
  }

  private async writeEvidence(taskId: string, result: PureExtractionResult): Promise<void> {
    await this.deps.evidenceStore.appendLog(taskId, 'runtime-evidence', {
      kind: 'pure_extraction',
      readyForPort: result.readyForPort,
      verificationOk: result.verification.ok
    });
    await this.deps.evidenceStore.writeSnapshot(taskId, 'run/frozen-sample', result.frozenSample);
    if (result.runtimeTrace) {
      await this.deps.evidenceStore.writeSnapshot(taskId, 'run/exported-runtime-trace', result.runtimeTrace);
    }
    await this.deps.evidenceStore.writeSnapshot(taskId, 'run/pure-boundary', result.boundary);
    await this.deps.evidenceStore.writeSnapshot(taskId, 'run/fixtures', result.fixture);
    await this.deps.evidenceStore.writeSnapshot(taskId, 'run/node-pure', result.nodePure);
    await this.deps.evidenceStore.writeSnapshot(taskId, 'run/pure-verification', result.verification);
    const report = await this.deps.pureReportBuilder.build(result, 'markdown');
    await this.deps.evidenceStore.writeSnapshot(taskId, 'run/pure-report-markdown', report);
  }
}
