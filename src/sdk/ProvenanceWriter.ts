import path from 'node:path';

import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { RegressionBaseline, RegressionRunResult } from '../regression/types.js';
import type { TaskManifestManager } from '../task/TaskManifestManager.js';
import { writeJsonFile } from './serialization.js';

export class ProvenanceWriter {
  constructor(
    private readonly deps: {
      evidenceStore: EvidenceStore;
      taskManifestManager: TaskManifestManager;
    }
  ) {}

  async write(options: {
    taskId: string;
    outputDir: string;
    baseline: RegressionBaseline;
    regression: RegressionRunResult;
    target: 'node' | 'python' | 'dual';
  }): Promise<string> {
    const manifest = await this.deps.taskManifestManager.getTask(options.taskId);
    const filePath = path.join(options.outputDir, 'provenance.json');
    await writeJsonFile(filePath, {
      baselineId: options.baseline.baselineId,
      generatedAt: new Date().toISOString(),
      regressionMatched: options.regression.matchedBaseline,
      regressionRunId: options.regression.runId,
      sourceArtifactPointers: manifest?.latestPointers ?? {},
      target: options.target,
      taskId: options.taskId
    });
    return filePath;
  }
}
