import { AppError } from '../core/errors.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { PureFixture } from '../pure/types.js';
import type { IntermediateBaseline } from '../regression/types.js';
import type { IntermediateProbe } from './types.js';
import { toPathMap } from './serialization.js';

function isProbe(value: unknown): value is IntermediateProbe {
  return value !== null && typeof value === 'object' && 'probeId' in value && 'path' in value;
}

function isIntermediateBaseline(value: unknown): value is IntermediateBaseline {
  return value !== null && typeof value === 'object' && 'baselineId' in value && 'fixtureFile' in value && 'intermediateKeys' in value;
}

export class IntermediateProbeRegistry {
  constructor(private readonly evidenceStore: EvidenceStore) {}

  async register(options: {
    taskId?: string;
    source: 'node-pure' | 'python-pure' | 'runtime-trace';
    probes: Array<{ path: string; value: unknown; note?: string }>;
  }): Promise<IntermediateProbe[]> {
    if (!options.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'Intermediate probes require taskId because they are artifact-backed.');
    }

    const createdAt = new Date().toISOString();
    const probes: IntermediateProbe[] = options.probes.map((probe, index) => ({
      createdAt,
      note: probe.note,
      path: probe.path,
      probeId: `probe-${Date.now()}-${index}`,
      source: options.source,
      taskId: options.taskId,
      value: probe.value
    }));

    for (const probe of probes) {
      await this.evidenceStore.appendLog(options.taskId, 'intermediate-probes', {
        probe
      });
    }

    return probes;
  }

  async list(taskId?: string, source?: string): Promise<IntermediateProbe[]> {
    if (!taskId) {
      return [];
    }

    const logs = await this.evidenceStore.readLog(taskId, 'intermediate-probes').catch(() => []);
    return logs
      .map((entry) => entry.probe)
      .filter(isProbe)
      .filter((probe) => !source || probe.source === source);
  }

  async latestByPath(taskId: string): Promise<Record<string, IntermediateProbe>> {
    const probes = await this.list(taskId);
    return Object.fromEntries(probes.map((probe) => [probe.path, probe]));
  }

  async registerBaseline(options: {
    taskId?: string;
    notes?: string[];
  }): Promise<{
    baseline: IntermediateBaseline;
    probes: IntermediateProbe[];
  }> {
    if (!options.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'Intermediate baseline requires taskId.');
    }

    const fixture = await this.evidenceStore.readSnapshot(options.taskId, 'run/fixtures').catch(() => undefined) as PureFixture | undefined;
    if (!fixture) {
      throw new AppError('INTERMEDIATE_BASELINE_SOURCE_MISSING', 'run/fixtures snapshot is required before registering an intermediate baseline.');
    }

    const probes = await this.list(options.taskId);
    const nodeProbes = probes.filter((probe) => probe.source === 'node-pure');
    const pythonProbes = probes.filter((probe) => probe.source === 'python-pure');
    const fixtureIntermediates = fixture.intermediates ?? {};
    const nodeMap = {
      ...fixtureIntermediates,
      ...toPathMap(nodeProbes)
    };
    const pythonMap = {
      ...fixtureIntermediates,
      ...toPathMap(pythonProbes)
    };
    const intermediateKeys = Array.from(new Set([
      ...Object.keys(fixtureIntermediates),
      ...nodeProbes.map((probe) => probe.path),
      ...pythonProbes.map((probe) => probe.path)
    ])).sort();
    const baseline: IntermediateBaseline = {
      baselineId: `intermediate-${Date.now()}`,
      createdAt: new Date().toISOString(),
      explicitInputs: fixture.boundary.explicitInputs,
      expectedNodeIntermediates: Object.keys(nodeMap).length > 0 ? nodeMap : undefined,
      expectedPythonIntermediates: Object.keys(pythonMap).length > 0 ? pythonMap : undefined,
      fixtureFile: typeof fixture.source?.taskId === 'string' ? '' : '',
      intermediateKeys,
      notes: [
        ...(options.notes ?? []),
        Object.keys(fixtureIntermediates).length === 0 && probes.length === 0
          ? 'No intermediate data existed at registration time; later regression will report this honestly.'
          : 'Intermediate baseline is artifact-backed from fixture.intermediates and registered probes.'
      ],
      outputKeys: fixture.boundary.outputs,
      source: pythonProbes.length > 0 ? 'port' : 'pure',
      taskId: options.taskId
    };

    const nodePure = await this.evidenceStore.readSnapshot(options.taskId, 'run/node-pure').catch(() => undefined) as { fixtureFile?: string } | undefined;
    baseline.fixtureFile = nodePure?.fixtureFile ?? '';

    await this.evidenceStore.appendLog(options.taskId, 'intermediate-baselines', {
      baseline
    });
    await this.evidenceStore.writeSnapshot(options.taskId, 'latest-intermediate-baseline', baseline);
    return { baseline, probes };
  }

  async listBaselines(taskId?: string): Promise<IntermediateBaseline[]> {
    if (!taskId) {
      return [];
    }

    const logs = await this.evidenceStore.readLog(taskId, 'intermediate-baselines').catch(() => []);
    return logs
      .map((entry) => entry.baseline)
      .filter(isIntermediateBaseline);
  }

  async getBaseline(baselineId: string, taskId?: string): Promise<IntermediateBaseline | null> {
    const baselines = await this.listBaselines(taskId);
    return baselines.find((baseline) => baseline.baselineId === baselineId) ?? null;
  }

  async getLatestBaseline(taskId?: string): Promise<IntermediateBaseline | null> {
    if (!taskId) {
      return null;
    }

    const snapshot = await this.evidenceStore.readSnapshot(taskId, 'latest-intermediate-baseline').catch(() => undefined);
    if (isIntermediateBaseline(snapshot)) {
      return snapshot;
    }

    const baselines = await this.listBaselines(taskId);
    return baselines.at(-1) ?? null;
  }
}
