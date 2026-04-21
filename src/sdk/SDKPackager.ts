import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { AppError } from '../core/errors.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { BaselineRegistry } from '../regression/BaselineRegistry.js';
import type { RegressionRunResult } from '../regression/types.js';
import type { StageGateEvaluator } from '../task/StageGateEvaluator.js';
import type { TaskManifestManager } from '../task/TaskManifestManager.js';
import { buildSdkContract } from './contract.js';
import type { SDKPackageExport } from './types.js';
import { buildNodeIndex, buildNodePackageJson, buildPythonClient, buildPythonInit, buildSdkReadme } from './templates.js';
import { nowStamp, writeJsonFile, writeTextFile } from './serialization.js';

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

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
    const regression = await this.readMatchedRegression(options.taskId, baseline.baselineId);

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
      const nodeImplSource = path.join(path.dirname(baseline.nodeEntryFile), 'pure-impl.js');
      const nodeEntryCopy = path.join(nodeDir, 'pure-entry.js');
      const nodeImplCopy = path.join(nodeDir, 'pure-impl.js');
      const hasNodeImpl = await pathExists(nodeImplSource);
      if (!hasNodeImpl) {
        throw new AppError('SDK_IMPLEMENTATION_NOT_FOUND', 'Node pure implementation file was not found beside the baseline entry.', {
          expectedPath: nodeImplSource
        });
      }
      await writeJsonFile(packageFile, buildNodePackageJson());
      await cp(baseline.nodeEntryFile, nodeEntryCopy);
      await cp(nodeImplSource, nodeImplCopy);
      await writeTextFile(indexFile, buildNodeIndex({ hasImpl: true }));
      files.push(packageFile, indexFile, nodeEntryCopy, nodeImplCopy);
    }

    if (target === 'python' || target === 'dual') {
      const packageDir = path.join(outputDir, 'python', 'package');
      const initFile = path.join(packageDir, '__init__.py');
      const clientFile = path.join(packageDir, 'client.py');
      if (!baseline.pythonEntryFile) {
        throw new AppError('SDK_IMPLEMENTATION_NOT_FOUND', 'Python target requested but baseline does not include a pythonEntryFile.');
      }
      const pythonEntryCopy = path.join(path.dirname(packageDir), 'pure_entry.py');
      const pythonImplSource = path.join(path.dirname(baseline.pythonEntryFile), 'pure_impl.py');
      const pythonImplCopy = path.join(packageDir, 'pure_impl.py');
      const hasPythonImpl = await pathExists(pythonImplSource);
      if (!hasPythonImpl) {
        throw new AppError('SDK_IMPLEMENTATION_NOT_FOUND', 'Python pure implementation file was not found beside the baseline entry.', {
          expectedPath: pythonImplSource
        });
      }
      await mkdir(path.dirname(pythonEntryCopy), { recursive: true });
      await mkdir(packageDir, { recursive: true });
      await cp(baseline.pythonEntryFile, pythonEntryCopy);
      await cp(pythonImplSource, pythonImplCopy);
      await writeTextFile(initFile, buildPythonInit());
      await writeTextFile(clientFile, buildPythonClient({ hasImpl: true }));
      files.push(initFile, clientFile, pythonEntryCopy, pythonImplCopy);
    }

    const result: SDKPackageExport = {
      contractFile,
      createdAt: new Date().toISOString(),
      files,
      notes: [
        'SDK package is a minimal delivery artifact and is not published automatically.',
        'Package is bound to the registered regression baseline and fixture contract.',
        `Export validated against regression run ${regression.runId}.`
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

  private async readMatchedRegression(taskId: string, baselineId: string): Promise<RegressionRunResult> {
    const regression = await this.deps.evidenceStore.readSnapshot(taskId, 'run/regression-run').catch(() => undefined);
    if (!regression || typeof regression !== 'object') {
      throw new AppError('SDK_REGRESSION_NOT_SATISFIED', 'Run run_regression_baseline and persist a matched regression before SDK export.', {
        missingSnapshot: 'run/regression-run',
        taskId
      });
    }

    const record = regression as RegressionRunResult;
    if (!record.matchedBaseline) {
      throw new AppError('SDK_REGRESSION_NOT_SATISFIED', 'Latest regression run did not match the baseline; do not export SDK yet.', {
        baselineId: record.baselineId,
        runId: record.runId,
        taskId
      });
    }

    if (record.baselineId !== baselineId) {
      throw new AppError('SDK_REGRESSION_NOT_SATISFIED', 'Latest regression run does not match the latest baseline.', {
        latestBaselineId: baselineId,
        regressionBaselineId: record.baselineId,
        runId: record.runId,
        taskId
      });
    }

    return record;
  }
}
