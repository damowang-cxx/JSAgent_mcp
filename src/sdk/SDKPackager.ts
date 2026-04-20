import { cp, rm } from 'node:fs/promises';
import path from 'node:path';

import { AppError } from '../core/errors.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { BaselineRegistry } from '../regression/BaselineRegistry.js';
import type { StageGateEvaluator } from '../task/StageGateEvaluator.js';
import type { TaskManifestManager } from '../task/TaskManifestManager.js';
import { buildSdkContract } from './contract.js';
import type { SDKPackageExport } from './types.js';
import { buildNodeIndex, buildNodePackageJson, buildPythonClient, buildPythonInit, buildSdkReadme } from './templates.js';
import { nowStamp, writeJsonFile, writeTextFile } from './serialization.js';

export class SDKPackager {
  constructor(
    private readonly deps: {
      baselineRegistry: BaselineRegistry;
      evidenceStore: EvidenceStore;
      stageGateEvaluator: StageGateEvaluator;
      taskManifestManager: TaskManifestManager;
    }
  ) {}

  async export(options: {
    taskId?: string;
    target?: 'node' | 'python' | 'dual';
    overwrite?: boolean;
  }): Promise<SDKPackageExport> {
    const target = options.target ?? 'dual';
    if (!options.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'SDK export requires taskId because delivery packages must be artifact-backed.');
    }

    const requiredGate = target === 'node' ? 'pure' : 'port';
    const gate = await this.deps.stageGateEvaluator.evaluate(options.taskId, requiredGate);
    if (!gate.passed) {
      throw new AppError('SDK_GATE_NOT_SATISFIED', `Cannot export ${target} SDK before ${requiredGate} gate passes.`, gate);
    }

    const baseline = await this.deps.baselineRegistry.getLatest(options.taskId);
    if (!baseline) {
      throw new AppError('SDK_BASELINE_NOT_FOUND', 'Register a regression baseline before SDK export.', {
        taskId: options.taskId
      });
    }

    const outputDir = path.join(this.deps.evidenceStore.getTaskDir(options.taskId), 'delivery', 'sdk');
    if (options.overwrite) {
      await rm(outputDir, { recursive: true, force: true });
    }

    const contract = buildSdkContract({ baseline, target });
    const contractFile = path.join(outputDir, 'contract.json');
    const fixtureFile = path.join(outputDir, 'fixtures.json');
    const readmeFile = path.join(outputDir, 'README.md');
    const files = [contractFile, fixtureFile, readmeFile];

    await writeJsonFile(contractFile, contract);
    await cp(baseline.fixtureFile, fixtureFile);
    await writeTextFile(readmeFile, buildSdkReadme({ baseline, target }));

    if (target === 'node' || target === 'dual') {
      const nodeDir = path.join(outputDir, 'node');
      const packageFile = path.join(nodeDir, 'package.json');
      const indexFile = path.join(nodeDir, 'index.mjs');
      await writeJsonFile(packageFile, buildNodePackageJson());
      await writeTextFile(indexFile, buildNodeIndex());
      files.push(packageFile, indexFile);
    }

    if (target === 'python' || target === 'dual') {
      const packageDir = path.join(outputDir, 'python', 'package');
      const initFile = path.join(packageDir, '__init__.py');
      const clientFile = path.join(packageDir, 'client.py');
      await writeTextFile(initFile, buildPythonInit());
      await writeTextFile(clientFile, buildPythonClient());
      files.push(initFile, clientFile);
    }

    const result: SDKPackageExport = {
      contractFile,
      createdAt: new Date().toISOString(),
      files,
      notes: [
        'SDK package is a minimal delivery artifact and is not published automatically.',
        'Package is bound to the registered regression baseline and fixture contract.'
      ],
      outputDir,
      packageId: `sdk-${nowStamp()}`,
      readmeFile,
      target,
      taskId: options.taskId
    };

    await this.deps.evidenceStore.writeSnapshot(options.taskId, 'delivery/sdk-package', result);
    await this.deps.taskManifestManager.updatePointers(options.taskId, {
      sdkPackage: 'delivery/sdk-package'
    });
    return result;
  }
}
