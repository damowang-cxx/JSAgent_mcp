import { AppError } from '../core/errors.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { IntermediateProbeRegistry } from '../intermediate/IntermediateProbeRegistry.js';
import type { StageGateEvaluator } from '../task/StageGateEvaluator.js';
import type { BaselineRegistry } from './BaselineRegistry.js';
import type { RegressionRunResult, VersionedBaseline } from './types.js';

function isVersionedBaseline(value: unknown): value is VersionedBaseline {
  return value !== null && typeof value === 'object' && 'versionId' in value && 'label' in value;
}

export class VersionedBaselineRegistry {
  constructor(
    private readonly deps: {
      baselineRegistry: BaselineRegistry;
      evidenceStore: EvidenceStore;
      intermediateProbeRegistry: IntermediateProbeRegistry;
      stageGateEvaluator: StageGateEvaluator;
    }
  ) {}

  async registerVersion(options: {
    taskId?: string;
    label: string;
    basedOnBaselineId?: string;
    notes?: string[];
  }): Promise<VersionedBaseline> {
    if (!options.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'Versioned upgrade baselines require taskId.');
    }

    const deliveryGate = await this.deps.stageGateEvaluator.evaluate(options.taskId, 'delivery');
    const regression = await this.deps.evidenceStore.readSnapshot(options.taskId, 'run/regression-run').catch(() => undefined) as RegressionRunResult | undefined;
    if (!deliveryGate.passed && (!regression || regression.matchedBaseline !== true)) {
      throw new AppError('VERSIONED_BASELINE_GATE_NOT_SATISFIED', 'Register versioned baselines only after regression matched or delivery gate passed.', {
        deliveryGate,
        hasRegression: Boolean(regression),
        regressionMatched: regression?.matchedBaseline ?? false
      });
    }

    const baseline = await this.deps.baselineRegistry.getLatest(options.taskId);
    if (!baseline) {
      throw new AppError('REGRESSION_BASELINE_NOT_FOUND', 'No latest regression baseline exists for versioned baseline registration.');
    }

    const probes = await this.deps.intermediateProbeRegistry.latestByPath(options.taskId);
    const version: VersionedBaseline = {
      basedOnBaselineId: options.basedOnBaselineId ?? baseline.baselineId,
      createdAt: new Date().toISOString(),
      intermediates: Object.keys(probes).length > 0
        ? Object.fromEntries(Object.entries(probes).map(([path, probe]) => [path, probe.value]))
        : undefined,
      label: options.label,
      nodeOutput: regression?.node?.output ?? baseline.expectedNodeOutput,
      notes: [
        ...(options.notes ?? []),
        'Versioned baseline is artifact-backed and should be used for upgrade regression only.'
      ],
      pythonOutput: regression?.python?.output ?? baseline.expectedPythonOutput,
      taskId: options.taskId,
      versionId: `version-${Date.now()}`
    };

    await this.deps.evidenceStore.appendLog(options.taskId, 'versioned-baselines', {
      baseline: version
    });
    await this.deps.evidenceStore.writeSnapshot(options.taskId, 'latest-versioned-baseline', version);
    return version;
  }

  async listVersions(taskId?: string): Promise<VersionedBaseline[]> {
    if (!taskId) {
      return [];
    }

    const logs = await this.deps.evidenceStore.readLog(taskId, 'versioned-baselines').catch(() => []);
    return logs.map((entry) => entry.baseline).filter(isVersionedBaseline);
  }

  async latestVersion(taskId?: string): Promise<VersionedBaseline | null> {
    if (!taskId) {
      return null;
    }

    const snapshot = await this.deps.evidenceStore.readSnapshot(taskId, 'latest-versioned-baseline').catch(() => undefined);
    if (isVersionedBaseline(snapshot)) {
      return snapshot;
    }

    const baselines = await this.listVersions(taskId);
    return baselines.at(-1) ?? null;
  }

  async getVersionByLabel(taskId: string, label: string): Promise<VersionedBaseline | null> {
    const baselines = await this.listVersions(taskId);
    return baselines.find((baseline) => baseline.label === label) ?? null;
  }
}
