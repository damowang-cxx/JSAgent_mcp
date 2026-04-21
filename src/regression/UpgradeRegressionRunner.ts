import { AppError } from '../core/errors.js';
import type { UpgradeDiffRunner } from '../port/UpgradeDiffRunner.js';
import type { IntermediateRegressionRunner } from './IntermediateRegressionRunner.js';
import type { RegressionRunner } from './RegressionRunner.js';
import { toUpgradeActions } from './upgradeDiff.js';
import type { UpgradeWorkflowResult } from './types.js';
import type { VersionedBaselineRegistry } from './VersionedBaselineRegistry.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';

export class UpgradeRegressionRunner {
  private lastResult: UpgradeWorkflowResult | null = null;

  constructor(
    private readonly deps: {
      evidenceStore: EvidenceStore;
      intermediateRegressionRunner: IntermediateRegressionRunner;
      regressionRunner: RegressionRunner;
      upgradeDiffRunner: UpgradeDiffRunner;
      versionedBaselineRegistry: VersionedBaselineRegistry;
    }
  ) {}

  async run(options: {
    taskId?: string;
    versionLabel?: string;
    timeoutMs?: number;
    writeEvidence?: boolean;
  }): Promise<UpgradeWorkflowResult> {
    if (!options.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'Upgrade regression requires taskId because versioned baselines are artifact-backed.');
    }

    const baseline = options.versionLabel
      ? await this.deps.versionedBaselineRegistry.getVersionByLabel(options.taskId, options.versionLabel)
      : await this.deps.versionedBaselineRegistry.latestVersion(options.taskId);
    if (!baseline) {
      throw new AppError('VERSIONED_BASELINE_NOT_FOUND', 'No versioned baseline was found for upgrade regression.', {
        taskId: options.taskId,
        versionLabel: options.versionLabel
      });
    }

    const currentRegression = await this.deps.regressionRunner.run({
      taskId: options.taskId,
      timeoutMs: options.timeoutMs,
      writeEvidence: options.writeEvidence
    });
    const intermediateRegression = await this.deps.intermediateRegressionRunner.run({
      taskId: options.taskId,
      timeoutMs: options.timeoutMs,
      writeEvidence: options.writeEvidence
    });
    const upgradeDiff = await this.deps.upgradeDiffRunner.analyze({
      oldSample: {
        nodeOutput: baseline.nodeOutput,
        pythonOutput: baseline.pythonOutput
      },
      newSample: {
        nodeOutput: currentRegression.node?.output,
        pythonOutput: currentRegression.python?.output
      },
      targetDescription: baseline.label
    });
    const actions = toUpgradeActions(upgradeDiff);
    const result: UpgradeWorkflowResult = {
      baseline,
      currentRegression,
      intermediateRegression,
      nextActions: [
        ...actions.nextActions,
        ...(intermediateRegression.matched ? [] : [intermediateRegression.nextActionHint])
      ],
      stopIf: actions.stopIf,
      upgradeDiff,
      whyTheseSteps: [
        'Upgrade regression compares current outputs against a versioned, artifact-backed baseline.',
        'Intermediate regression runs before final-upgrade conclusion whenever intermediate data exists.'
      ]
    };

    if (options.writeEvidence) {
      await this.deps.evidenceStore.writeSnapshot(options.taskId, 'run/upgrade-workflow', result);
      await this.deps.evidenceStore.writeSnapshot(options.taskId, 'run/upgrade-diff', upgradeDiff);
    }

    this.lastResult = result;
    return result;
  }

  getLastUpgradeWorkflowResult(): UpgradeWorkflowResult | null {
    return this.lastResult;
  }
}
