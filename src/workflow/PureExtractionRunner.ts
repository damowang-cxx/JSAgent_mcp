import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import { AppError } from '../core/errors.js';
import type { BoundaryDefiner } from '../pure/BoundaryDefiner.js';
import type { FreezeManager } from '../pure/FreezeManager.js';
import type { PureFixtureBuilder } from '../pure/PureFixtureBuilder.js';
import type { PureNodeExtractor } from '../pure/PureNodeExtractor.js';
import type { PureVerifier } from '../pure/PureVerifier.js';
import type { RuntimeTraceSampler } from '../pure/RuntimeTraceSampler.js';
import type { PureBoundary, PureExtractionResult, PureExtractionSource, PureSource } from '../pure/types.js';
import type { PurePreflightContext, StoredPurePreflightSnapshot } from '../pure-preflight/types.js';
import type { PurePreflightRegistry } from '../pure-preflight/PurePreflightRegistry.js';
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
      purePreflightRegistry: PurePreflightRegistry;
      rebuildWorkflowRunner: RebuildWorkflowRunner;
      analyzeTargetRunner: AnalyzeTargetRunner;
    }
  ) {}

  async run(options: {
    taskId?: string;
    source?: PureExtractionSource;
    purePreflight?: PurePreflightContext | null;
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
      source: this.toFreezeSource(options.source),
      taskId: options.taskId
    });
    const bundle = await this.resolveRebuildBundle(options.taskId);
    const preflight = options.purePreflight ?? await this.resolvePreflight(options);
    const targetFunctionName = options.targetFunctionName ?? this.targetFromPreflight(preflight);
    const runtimeTrace = bundle?.bundleDir
      ? await this.deps.runtimeTraceSampler.sample({
          bundleDir: bundle.bundleDir,
          fixturePath: bundle.fixtureFile ?? undefined,
          probeExpressions: options.probeExpressions,
          targetFunctionName,
          timeoutMs: options.traceTimeoutMs
        })
      : null;
    const baseBoundary = await this.deps.boundaryDefiner.define({
      analyzeTargetSummary: this.deps.analyzeTargetRunner.getLastAnalyzeTargetResult(),
      frozenSample,
      runtimeTrace
    });
    const boundary = this.applyPreflightToBoundary(baseBoundary, preflight);
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
      targetFunctionName,
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
      nextActions: this.buildNextActions(readyForPort, verification.ok, runtimeTrace, preflight),
      nodePure,
      purePreflightUsed: preflight ? this.summarizePreflight(preflight) : null,
      readyForPort,
      runtimeTrace,
      expectedOutputsSource: this.sourceLabel(preflight, 'expected outputs'),
      preservedInputsSource: this.sourceLabel(preflight, 'preserved inputs'),
      excludedNoiseSource: this.sourceLabel(preflight, 'excluded noise'),
      stopIf: this.buildStopIf(readyForPort, verification.ok, preflight),
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
      whyTheseSteps: this.buildWhyTheseSteps(runtimeTrace, boundary.explicitInputs.length, verification.ok, preflight)
    };

    if (options.writeEvidence && options.taskId) {
      if (preflight) {
        await this.deps.evidenceStore.writeSnapshot(options.taskId, 'pure-preflight/latest', {
          createdAt: new Date().toISOString(),
          result: preflight,
          taskId: options.taskId
        } satisfies StoredPurePreflightSnapshot);
      }
      await this.writeEvidence(options.taskId, result);
    }

    this.lastResult = result;
    return result;
  }

  getLastPureExtractionResult(): PureExtractionResult | null {
    return this.lastResult;
  }

  private toFreezeSource(source: PureExtractionSource | undefined): PureSource {
    if (source === 'analyze-target-last' || source === 'current-page' || source === 'patch-last') {
      return source;
    }
    return 'patch-last';
  }

  private async resolvePreflight(options: {
    taskId?: string;
    source?: PureExtractionSource;
  }): Promise<PurePreflightContext | null> {
    if (options.source === 'task-artifact' && !options.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'PureExtractionRunner source=task-artifact requires taskId.');
    }

    if (options.source === 'task-artifact' && options.taskId) {
      const snapshot = await this.readStoredPreflight(options.taskId);
      return snapshot?.result ?? null;
    }

    if (options.source === 'pure-preflight-last' && options.taskId) {
      const snapshot = await this.deps.purePreflightRegistry.readFromTask(options.taskId);
      if (snapshot) {
        return snapshot.result;
      }
    }

    if (options.source === 'pure-preflight-last') {
      return this.deps.purePreflightRegistry.getLast();
    }

    return null;
  }

  private async readStoredPreflight(taskId: string): Promise<StoredPurePreflightSnapshot | null> {
    try {
      const snapshot = await this.deps.evidenceStore.readSnapshot(taskId, 'pure-preflight/latest');
      return snapshot && typeof snapshot === 'object' && 'createdAt' in snapshot && 'result' in snapshot
        ? snapshot as StoredPurePreflightSnapshot
        : null;
    } catch {
      return null;
    }
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

  private applyPreflightToBoundary(boundary: PureBoundary, preflight: PurePreflightContext | null): PureBoundary {
    if (!preflight) {
      return boundary;
    }

    const expectedOutputs = preflight.expectedOutputs.map((output) => this.toBoundaryLabel(output.name));
    const explicitInputs = preflight.preservedInputs.map((input) => this.toBoundaryLabel(input.name));
    const derivedInputs = preflight.preservedInputs
      .filter((input) => !input.preserveFreshness)
      .map((input) => this.toBoundaryLabel(input.name));
    const excludedRuntimeNoise = [
      ...boundary.excludedRuntimeNoise,
      ...preflight.excludedNoise
    ];

    return {
      ...boundary,
      derivedInputs: uniqueStrings([
        ...boundary.derivedInputs,
        ...derivedInputs
      ], 80),
      excludedRuntimeNoise: uniqueStrings(excludedRuntimeNoise, 100),
      explicitInputs: uniqueStrings([
        ...boundary.explicitInputs,
        ...explicitInputs
      ], 80),
      notes: uniqueStrings([
        ...boundary.notes,
        `Pure preflight ${preflight.contextId} was applied before fixture/scaffold generation.`,
        `Expected outputs source: ${this.sourceLabel(preflight, 'expected outputs')}.`,
        `Preserved inputs source: ${this.sourceLabel(preflight, 'preserved inputs')}.`,
        `Excluded noise source: ${this.sourceLabel(preflight, 'excluded noise')}.`,
        ...preflight.pureNotes.slice(0, 10)
      ], 80),
      outputs: uniqueStrings([
        ...expectedOutputs,
        ...boundary.outputs
      ], 80)
    };
  }

  private targetFromPreflight(preflight: PurePreflightContext | null): string | undefined {
    if (!preflight) {
      return undefined;
    }
    return preflight.usedFlowReasoning?.targetName ??
      preflight.usedBoundaryFixture?.targetName ??
      preflight.usedCompareAnchor?.label ??
      preflight.expectedOutputs[0]?.name;
  }

  private buildNextActions(
    readyForPort: boolean,
    verificationOk: boolean,
    runtimeTrace: PureExtractionResult['runtimeTrace'],
    preflight: PurePreflightContext | null
  ): string[] {
    if (readyForPort) {
      return uniqueStrings([
        'Freeze the Node pure scaffold as the port baseline.',
        'Only start Python or another host port after keeping this fixture and verification result with the task.',
        preflight ? `Keep pure preflight ${preflight.contextId} attached as port baseline provenance.` : ''
      ], 12);
    }

    if (!runtimeTrace || runtimeTrace.records.length === 0) {
      return uniqueStrings([
        'Collect a runtime trace from the local rebuild bundle before strengthening the pure implementation.',
        'Do not port yet; boundary outputs are under-observed.',
        ...(preflight?.nextActions.slice(0, 4) ?? [])
      ], 12);
    }

    if (!verificationOk) {
      return uniqueStrings([
        'Implement computePure against the boundary and rerun verify_node_pure.',
        preflight?.usedPatchPreflight
          ? `If output divergence persists, return to patch preflight ${preflight.usedPatchPreflight.surface}:${preflight.usedPatchPreflight.target}.`
          : 'If output divergence persists, return to define_pure_boundary or export_runtime_trace before porting.',
        ...(preflight?.nextActions.slice(0, 4) ?? [])
      ], 12);
    }

    return uniqueStrings([
      'Review boundary notes before marking the scaffold as ready for external port.',
      ...(preflight?.nextActions.slice(0, 4) ?? [])
    ], 12);
  }

  private buildWhyTheseSteps(
    runtimeTrace: PureExtractionResult['runtimeTrace'],
    explicitInputCount: number,
    verificationOk: boolean,
    preflight: PurePreflightContext | null
  ): string[] {
    return uniqueStrings([
      'PureExtraction starts from a frozen accepted sample so fixture output remains stable.',
      runtimeTrace
        ? `Runtime trace collected ${runtimeTrace.records.length} records from local rebuild runtime.`
        : 'No local rebuild runtime trace was available; boundary and fixture are sample-only.',
      `Boundary contains ${explicitInputCount} explicit input labels.`,
      `Node pure verification ${verificationOk ? 'matched' : 'did not match'} the fixture expected output.`,
      preflight
        ? `Pure preflight ${preflight.contextId} contributed ${preflight.expectedOutputs.length} expected output(s), ${preflight.preservedInputs.length} preserved input(s), and ${preflight.excludedNoise.length} excluded noise rule(s).`
        : 'No pure preflight context was attached; this run used legacy frozen sample/runtime trace context only.',
      preflight?.usedCompareAnchor
        ? `Compare anchor ${preflight.usedCompareAnchor.label} was available as first explainable output context.`
        : '',
      preflight?.usedFlowReasoning
        ? `Flow reasoning ${preflight.usedFlowReasoning.resultId} was used as enhancer provenance, not as the sole truth source.`
        : ''
    ], 20);
  }

  private buildStopIf(readyForPort: boolean, verificationOk: boolean, preflight: PurePreflightContext | null): string[] {
    return uniqueStrings([
      'Stop if patch gate or acceptance evidence is missing.',
      'Stop if the boundary has no explicit inputs or no observed output.',
      ...(verificationOk ? [] : ['Stop porting; fix Node pure verification before Python or other host ports.']),
      ...(preflight?.stopIf.slice(0, 5) ?? []),
      ...(readyForPort ? ['Stop collecting more browser noise; this result is ready to become the port baseline.'] : [])
    ], 16);
  }

  private async writeEvidence(taskId: string, result: PureExtractionResult): Promise<void> {
    await this.deps.evidenceStore.appendLog(taskId, 'runtime-evidence', {
      kind: 'pure_extraction',
      purePreflightUsed: result.purePreflightUsed ?? null,
      readyForPort: result.readyForPort,
      verificationOk: result.verification.ok
    });
    if (result.purePreflightUsed) {
      await this.deps.evidenceStore.appendLog(taskId, 'runtime-evidence', {
        contextId: result.purePreflightUsed.contextId,
        kind: 'pure_preflight',
        source: result.purePreflightUsed.source,
        usedBoundaryFixture: result.purePreflightUsed.usedBoundaryFixture ?? null,
        usedCompareAnchor: result.purePreflightUsed.usedCompareAnchor ?? null,
        usedFlowReasoning: result.purePreflightUsed.usedFlowReasoning ?? null,
        usedPatchPreflight: result.purePreflightUsed.usedPatchPreflight ?? null,
        usedRebuildContext: result.purePreflightUsed.usedRebuildContext ?? null
      });
    }
    await this.deps.evidenceStore.writeSnapshot(taskId, 'run/frozen-sample', result.frozenSample);
    if (result.runtimeTrace) {
      await this.deps.evidenceStore.writeSnapshot(taskId, 'run/exported-runtime-trace', result.runtimeTrace);
    }
    await this.deps.evidenceStore.writeSnapshot(taskId, 'run/pure-boundary', result.boundary);
    await this.deps.evidenceStore.writeSnapshot(taskId, 'run/fixtures', result.fixture);
    await this.deps.evidenceStore.writeSnapshot(taskId, 'run/node-pure', result.nodePure);
    await this.deps.evidenceStore.writeSnapshot(taskId, 'run/pure-verification', result.verification);
    await this.deps.evidenceStore.writeSnapshot(taskId, 'run/pure-extraction', result);
    const report = await this.deps.pureReportBuilder.build(result, 'markdown');
    await this.deps.evidenceStore.writeSnapshot(taskId, 'run/pure-report-markdown', report);
  }

  private summarizePreflight(preflight: PurePreflightContext): NonNullable<PureExtractionResult['purePreflightUsed']> {
    return {
      contextId: preflight.contextId,
      source: preflight.source,
      usedBoundaryFixture: preflight.usedBoundaryFixture ?? null,
      usedCompareAnchor: preflight.usedCompareAnchor ?? null,
      usedFlowReasoning: preflight.usedFlowReasoning ?? null,
      usedPatchPreflight: preflight.usedPatchPreflight ?? null,
      usedRebuildContext: preflight.usedRebuildContext ?? null
    };
  }

  private sourceLabel(preflight: PurePreflightContext | null, label: string): string {
    if (!preflight) {
      return `legacy pure workflow ${label}`;
    }
    return `pure-preflight:${preflight.contextId}:${preflight.source}`;
  }

  private toBoundaryLabel(value: string): string {
    return value.replace(/\s+/g, ' ').trim().slice(0, 160);
  }
}

function uniqueStrings(values: readonly string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}
