import { AppError } from '../core/errors.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { IntermediateAlignment } from '../intermediate/IntermediateAlignment.js';
import type { IntermediateDiff } from '../intermediate/IntermediateDiff.js';
import type { IntermediateProbeRegistry } from '../intermediate/IntermediateProbeRegistry.js';
import type { PureFixture } from '../pure/types.js';
import type { BaselineRegistry } from './BaselineRegistry.js';
import type { RegressionRunner } from './RegressionRunner.js';
import type { IntermediateBaseline, IntermediateRegressionResult, RegressionBaseline } from './types.js';

export class IntermediateRegressionRunner {
  private lastResult: IntermediateRegressionResult | null = null;

  constructor(
    private readonly deps: {
      baselineRegistry: BaselineRegistry;
      evidenceStore: EvidenceStore;
      intermediateAlignment: IntermediateAlignment;
      intermediateDiff: IntermediateDiff;
      intermediateProbeRegistry: IntermediateProbeRegistry;
      regressionRunner: RegressionRunner;
    }
  ) {}

  async run(options: {
    taskId?: string;
    baselineId?: string;
    timeoutMs?: number;
    writeEvidence?: boolean;
  }): Promise<IntermediateRegressionResult> {
    if (!options.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'Intermediate regression requires taskId because probes and baselines are artifact-backed.');
    }

    const baseline = await this.resolveBaseline(options.taskId, options.baselineId);
    const regression = await this.deps.regressionRunner.run({
      taskId: options.taskId,
      timeoutMs: options.timeoutMs,
      writeEvidence: options.writeEvidence
    });

    const probes = await this.deps.intermediateProbeRegistry.list(options.taskId);
    const fixture = await this.deps.evidenceStore.readSnapshot(options.taskId, 'run/fixtures').catch(() => undefined) as PureFixture | undefined;
    const nodeIntermediates = this.buildActualIntermediates(
      probes.filter((probe) => probe.source === 'node-pure'),
      fixture?.intermediates
    );
    const pythonIntermediates = this.buildActualIntermediates(
      probes.filter((probe) => probe.source === 'python-pure'),
      undefined
    );

    const notes: string[] = [];
    if (Object.keys(nodeIntermediates).length === 0 && Object.keys(pythonIntermediates).length === 0) {
      notes.push('No intermediate probes were available; intermediate regression fell back to final-output comparison only.');
    }
    if (fixture?.intermediates && Object.keys(nodeIntermediates).length > 0 && probes.filter((probe) => probe.source === 'node-pure').length === 0) {
      notes.push('Node intermediate values used fixture.intermediates fallback because no fresh node-pure probes were registered.');
    }

    const alignment = await this.deps.intermediateAlignment.align({
      node: Object.keys(nodeIntermediates).length > 0 ? nodeIntermediates : undefined,
      python: Object.keys(pythonIntermediates).length > 0 ? pythonIntermediates : undefined
    });

    const nodeDiff = await this.deps.intermediateDiff.diff({
      actual: Object.keys(nodeIntermediates).length > 0 ? nodeIntermediates : undefined,
      expected: baseline.expectedNodeIntermediates,
      layer: 'node-intermediate'
    });
    const pythonDiff = await this.deps.intermediateDiff.diff({
      actual: Object.keys(pythonIntermediates).length > 0 ? pythonIntermediates : undefined,
      expected: baseline.expectedPythonIntermediates,
      layer: 'python-intermediate'
    });
    const crossDiff = await this.deps.intermediateDiff.diff({
      actual: Object.keys(pythonIntermediates).length > 0 ? pythonIntermediates : undefined,
      expected: Object.keys(nodeIntermediates).length > 0 ? nodeIntermediates : undefined,
      layer: 'cross-language-intermediate'
    });

    const divergence = nodeDiff
      ?? pythonDiff
      ?? crossDiff
      ?? (regression.divergence
        ? {
            actual: regression.divergence.actual,
            expected: regression.divergence.expected,
            layer: 'final-output' as const,
            message: regression.divergence.message,
            path: regression.divergence.path
          }
        : null);
    const matched = divergence === null && regression.matchedBaseline;
    const result: IntermediateRegressionResult = {
      baselineId: baseline.baselineId,
      divergence,
      executedAt: new Date().toISOString(),
      matched,
      nextActionHint: this.nextActionHint(divergence, notes),
      nodeIntermediates: Object.keys(nodeIntermediates).length > 0 ? nodeIntermediates : undefined,
      notes: [
        ...notes,
        `Aligned intermediate keys: ${alignment.keys.join(', ') || '(none)'}.`
      ],
      pythonIntermediates: Object.keys(pythonIntermediates).length > 0 ? pythonIntermediates : undefined,
      runId: `intermediate-${Date.now()}`
    };

    if (options.writeEvidence) {
      await this.deps.evidenceStore.writeSnapshot(options.taskId, 'run/intermediate-regression', result);
      await this.deps.evidenceStore.writeSnapshot(options.taskId, 'run/intermediate-diff', result.divergence ?? {
        matched: true
      });
    }

    this.lastResult = result;
    return result;
  }

  getLastIntermediateRegressionResult(): IntermediateRegressionResult | null {
    return this.lastResult;
  }

  private async resolveBaseline(taskId: string, baselineId?: string): Promise<IntermediateBaseline> {
    const baseline = baselineId
      ? await this.deps.intermediateProbeRegistry.getBaseline(baselineId, taskId)
      : await this.deps.intermediateProbeRegistry.getLatestBaseline(taskId);
    if (baseline) {
      return baseline;
    }

    const regressionBaseline = await this.deps.baselineRegistry.getLatest(taskId);
    if (!regressionBaseline) {
      throw new AppError('REGRESSION_BASELINE_NOT_FOUND', 'No regression baseline exists for intermediate regression.');
    }

    return await this.syntheticBaseline(taskId, regressionBaseline);
  }

  private async syntheticBaseline(taskId: string, regressionBaseline: RegressionBaseline): Promise<IntermediateBaseline> {
    const fixture = await this.deps.evidenceStore.readSnapshot(taskId, 'run/fixtures').catch(() => undefined) as PureFixture | undefined;
    const intermediates = fixture?.intermediates ?? {};
    return {
      baselineId: `synthetic-${regressionBaseline.baselineId}`,
      createdAt: new Date().toISOString(),
      expectedNodeIntermediates: Object.keys(intermediates).length > 0 ? intermediates : undefined,
      expectedPythonIntermediates: undefined,
      explicitInputs: regressionBaseline.contractSummary?.explicitInputs ?? [],
      fixtureFile: regressionBaseline.fixtureFile,
      intermediateKeys: Object.keys(intermediates).sort(),
      notes: ['No registered intermediate baseline existed; a synthetic baseline was built from fixture.intermediates.'],
      outputKeys: regressionBaseline.contractSummary?.outputs ?? [],
      source: regressionBaseline.source,
      taskId
    };
  }

  private buildActualIntermediates(
    probes: Array<{ path: string; value: unknown }>,
    fallback?: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      ...(fallback ?? {}),
      ...Object.fromEntries(probes.map((probe) => [probe.path, probe.value]))
    };
  }

  private nextActionHint(
    divergence: IntermediateRegressionResult['divergence'],
    notes: string[]
  ): string {
    if (!divergence) {
      return 'Intermediate alignment matched the baseline. Keep this alongside final-output regression.';
    }

    if (notes.some((note) => /No intermediate probes/i.test(note))) {
      return 'Register intermediate probes or fixture intermediates before concluding this is only a final-output problem.';
    }

    switch (divergence.layer) {
      case 'node-intermediate':
        return 'Fix the first diverging Node intermediate before changing Python or refreshing the baseline.';
      case 'python-intermediate':
        return 'Sync Python intermediate behavior with the Node baseline before changing final output logic.';
      case 'cross-language-intermediate':
        return 'Compare Node and Python intermediate probes at the reported path before looking only at final output.';
      case 'final-output':
        return 'Intermediate data did not explain the mismatch first; inspect final output regression next.';
    }
  }
}
