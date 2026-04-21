import type { UpgradeRegressionRunner } from '../regression/UpgradeRegressionRunner.js';
import type { UpgradeWorkflowResult } from '../regression/types.js';

export class UpgradeWorkflowRunner {
  private lastResult: UpgradeWorkflowResult | null = null;

  constructor(private readonly upgradeRegressionRunner: UpgradeRegressionRunner) {}

  async run(options: {
    taskId?: string;
    versionLabel?: string;
    timeoutMs?: number;
    writeEvidence?: boolean;
  }): Promise<UpgradeWorkflowResult> {
    const result = await this.upgradeRegressionRunner.run(options);
    this.lastResult = result;
    return result;
  }

  getLastUpgradeWorkflowResult(): UpgradeWorkflowResult | null {
    return this.lastResult ?? this.upgradeRegressionRunner.getLastUpgradeWorkflowResult();
  }
}
