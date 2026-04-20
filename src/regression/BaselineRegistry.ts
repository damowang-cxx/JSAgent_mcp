import { AppError } from '../core/errors.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { NodePureScaffold, PureFixture, PureVerificationResult } from '../pure/types.js';
import type { PythonPureScaffold, PythonVerificationResult } from '../port/types.js';
import type { StageGateEvaluator } from '../task/StageGateEvaluator.js';
import type { TaskManifestManager } from '../task/TaskManifestManager.js';
import type { RegressionBaseline } from './types.js';

function isBaseline(value: unknown): value is RegressionBaseline {
  return value !== null && typeof value === 'object' && 'baselineId' in value && 'fixtureFile' in value;
}

export class BaselineRegistry {
  constructor(
    private readonly deps: {
      evidenceStore: EvidenceStore;
      stageGateEvaluator: StageGateEvaluator;
      taskManifestManager: TaskManifestManager;
    }
  ) {}

  async register(options: {
    taskId?: string;
    source?: 'pure' | 'port';
    notes?: string[];
  }): Promise<RegressionBaseline> {
    if (!options.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'Regression baselines require a taskId because task artifacts are the truth source.');
    }

    const source = options.source ?? 'port';
    const gate = await this.deps.stageGateEvaluator.evaluate(options.taskId, source);
    if (!gate.passed) {
      throw new AppError('BASELINE_GATE_NOT_SATISFIED', `Cannot register ${source} regression baseline before gate passes.`, gate);
    }

    const fixture = await this.readSnapshot<PureFixture>(options.taskId, 'run/fixtures');
    const nodePure = await this.readSnapshot<NodePureScaffold>(options.taskId, 'run/node-pure');
    const nodeVerification = await this.readSnapshot<PureVerificationResult>(options.taskId, 'run/pure-verification');
    const pythonPure = source === 'port'
      ? await this.readSnapshot<PythonPureScaffold>(options.taskId, 'run/python-pure')
      : null;
    const pythonVerification = source === 'port'
      ? await this.readSnapshot<PythonVerificationResult>(options.taskId, 'run/python-verification')
      : null;
    const baseline: RegressionBaseline = {
      baselineId: `baseline-${Date.now()}`,
      contractSummary: {
        explicitInputs: fixture.boundary.explicitInputs,
        outputs: fixture.boundary.outputs
      },
      createdAt: new Date().toISOString(),
      expectedNodeOutput: nodeVerification.pureOutput,
      expectedPythonOutput: pythonVerification?.pythonOutput,
      fixtureFile: nodePure.fixtureFile,
      nodeEntryFile: nodePure.entryFile,
      notes: [
        ...(options.notes ?? []),
        `Registered from ${source} gate.`,
        'Do not refresh this baseline until acceptance confirms any changed behavior.'
      ],
      pythonEntryFile: pythonPure?.entryFile ?? null,
      source,
      taskId: options.taskId
    };

    await this.deps.evidenceStore.appendLog(options.taskId, 'regression-baselines', {
      baseline
    });
    await this.deps.evidenceStore.writeSnapshot(options.taskId, 'latest-baseline', baseline);
    await this.deps.taskManifestManager.updatePointers(options.taskId, {
      baseline: 'latest-baseline'
    });
    return baseline;
  }

  async list(taskId?: string): Promise<RegressionBaseline[]> {
    if (!taskId) {
      return [];
    }

    const logs = await this.deps.evidenceStore.readLog(taskId, 'regression-baselines').catch(() => []);
    return logs
      .map((entry) => entry.baseline)
      .filter(isBaseline);
  }

  async get(baselineId: string, taskId?: string): Promise<RegressionBaseline | null> {
    const baselines = await this.list(taskId);
    return baselines.find((baseline) => baseline.baselineId === baselineId) ?? null;
  }

  async getLatest(taskId?: string): Promise<RegressionBaseline | null> {
    if (!taskId) {
      return null;
    }

    const snapshot = await this.deps.evidenceStore.readSnapshot(taskId, 'latest-baseline').catch(() => undefined);
    if (isBaseline(snapshot)) {
      return snapshot;
    }

    const baselines = await this.list(taskId);
    return baselines.at(-1) ?? null;
  }

  private async readSnapshot<T>(taskId: string, name: string): Promise<T> {
    const snapshot = await this.deps.evidenceStore.readSnapshot(taskId, name).catch(() => undefined);
    if (!snapshot) {
      throw new AppError('BASELINE_ARTIFACT_MISSING', `Missing baseline artifact: ${name}`, {
        snapshotName: name,
        taskId
      });
    }
    return snapshot as T;
  }
}
