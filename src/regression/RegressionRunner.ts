import { AppError } from '../core/errors.js';
import type { RegressionContext } from '../delivery-consumption/types.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { CrossLanguageVerifier } from '../port/CrossLanguageVerifier.js';
import type { PureVerifier } from '../pure/PureVerifier.js';
import type { BaselineRegistry } from './BaselineRegistry.js';
import type { RegressionDiff } from './RegressionDiff.js';
import type { RegressionRunResult } from './types.js';

export class RegressionRunner {
  private lastResult: RegressionRunResult | null = null;

  constructor(
    private readonly deps: {
      baselineRegistry: BaselineRegistry;
      crossLanguageVerifier: CrossLanguageVerifier;
      evidenceStore: EvidenceStore;
      pureVerifier: PureVerifier;
      regressionDiff: RegressionDiff;
    }
  ) {}

  async run(options: {
    baselineId?: string;
    taskId?: string;
    timeoutMs?: number;
    writeEvidence?: boolean;
    regressionContext?: RegressionContext | null;
  }): Promise<RegressionRunResult> {
    const baseline = options.baselineId
      ? await this.deps.baselineRegistry.get(options.baselineId, options.taskId)
      : await this.deps.baselineRegistry.getLatest(options.taskId);
    if (!baseline) {
      throw new AppError('REGRESSION_BASELINE_NOT_FOUND', 'No regression baseline was found.', options);
    }

    const nodeVerification = await this.deps.pureVerifier.verify({
      entryFile: baseline.nodeEntryFile,
      expectedOutput: baseline.expectedNodeOutput,
      fixtureFile: baseline.fixtureFile,
      timeoutMs: options.timeoutMs
    });
    const pythonVerification = baseline.pythonEntryFile
      ? await this.deps.crossLanguageVerifier.verify({
          fixtureFile: baseline.fixtureFile,
          nodeEntryFile: baseline.nodeEntryFile,
          pythonEntryFile: baseline.pythonEntryFile,
          timeoutMs: options.timeoutMs
        })
      : null;
    const diffResult = this.deps.regressionDiff.diff({
      baseline,
      nodeVerification,
      pythonVerification
    });
    const result: RegressionRunResult = options.regressionContext
      ? {
          ...diffResult,
          compareAnchorUsed: options.regressionContext.compareAnchor ?? null,
          flowReasoningUsed: options.regressionContext.flowReasoning ?? null,
          notes: [
            ...diffResult.notes,
            `Regression context ${options.regressionContext.contextId} attached as provenance; matchedBaseline remains deterministic.`
          ],
          patchPreflightUsed: options.regressionContext.patchPreflight ?? null,
          purePreflightUsed: options.regressionContext.purePreflight ?? null,
          rebuildContextUsed: options.regressionContext.rebuildContext ?? null,
          regressionContextUsed: options.regressionContext
        }
      : diffResult;

    if (options.writeEvidence && baseline.taskId) {
      await this.deps.evidenceStore.writeSnapshot(baseline.taskId, 'run/regression-run', result);
      await this.deps.evidenceStore.writeSnapshot(baseline.taskId, 'run/regression-diff', result.divergence ?? {
        matched: true
      });
      await this.deps.evidenceStore.appendLog(baseline.taskId, 'regression', {
        baselineId: baseline.baselineId,
        matchedBaseline: result.matchedBaseline,
        runId: result.runId
      });
    }

    this.lastResult = result;
    return result;
  }

  getLastRegressionRunResult(): RegressionRunResult | null {
    return this.lastResult;
  }
}
