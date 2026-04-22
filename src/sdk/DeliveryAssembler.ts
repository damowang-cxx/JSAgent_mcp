import { cp, rm } from 'node:fs/promises';
import path from 'node:path';

import { AppError } from '../core/errors.js';
import type { DeliveryContext } from '../delivery-consumption/types.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { BaselineRegistry } from '../regression/BaselineRegistry.js';
import type { RegressionRunResult } from '../regression/types.js';
import type { TaskManifestManager } from '../task/TaskManifestManager.js';
import type { StageGateEvaluator } from '../task/StageGateEvaluator.js';
import type { SDKPackager } from './SDKPackager.js';
import type { DeliveryBundleExport } from './types.js';
import { writeTextFile } from './serialization.js';
import type { ProvenanceWriter } from './ProvenanceWriter.js';

export class DeliveryAssembler {
  constructor(
    private readonly deps: {
      baselineRegistry: BaselineRegistry;
      evidenceStore: EvidenceStore;
      provenanceWriter: ProvenanceWriter;
      sdkPackager: SDKPackager;
      stageGateEvaluator: StageGateEvaluator;
      taskManifestManager: TaskManifestManager;
    }
  ) {}

  async assemble(options: {
    taskId?: string;
    target?: 'node' | 'python' | 'dual';
    overwrite?: boolean;
    deliveryContext?: DeliveryContext | null;
  }): Promise<DeliveryBundleExport> {
    const target = options.target ?? 'dual';
    if (!options.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'Delivery bundle export requires taskId.');
    }

    const requiredGate = target === 'node' ? 'pure' : 'port';
    const gate = await this.deps.stageGateEvaluator.evaluate(options.taskId, requiredGate);
    if (!gate.passed) {
      throw new AppError('DELIVERY_GATE_NOT_SATISFIED', `Cannot export delivery bundle before ${requiredGate} gate passes.`, gate);
    }

    const baseline = await this.deps.baselineRegistry.getLatest(options.taskId);
    if (!baseline) {
      throw new AppError('SDK_BASELINE_NOT_FOUND', 'No regression baseline exists for delivery bundle export.');
    }

    const regression = await this.deps.evidenceStore.readSnapshot(options.taskId, 'run/regression-run').catch(() => undefined) as RegressionRunResult | undefined;
    if (!regression || regression.matchedBaseline !== true || regression.baselineId !== baseline.baselineId) {
      throw new AppError('DELIVERY_REGRESSION_NOT_SATISFIED', 'Export delivery bundle only after a matched regression for the latest baseline.', {
        baselineId: baseline.baselineId,
        regressionBaselineId: regression?.baselineId,
        regressionMatched: regression?.matchedBaseline ?? false
      });
    }

    const sdkExport = await this.deps.sdkPackager.export({
      deliveryContext: options.deliveryContext ?? null,
      overwrite: true,
      target,
      taskId: options.taskId
    });
    const outputDir = path.join(this.deps.evidenceStore.getTaskDir(options.taskId), 'delivery', 'bundle');
    if (options.overwrite) {
      await rm(outputDir, { recursive: true, force: true });
    }
    await cp(sdkExport.outputDir, outputDir, { recursive: true });

    const smokeEntries = await this.writeSmokeEntries(outputDir, target);
    const provenanceFile = await this.deps.provenanceWriter.write({
      baseline,
      outputDir,
      regression,
      target,
      taskId: options.taskId
    });
    const files = await this.deps.evidenceStore.listSnapshots(options.taskId).catch(() => []);
    const bundle: DeliveryBundleExport = {
      bundleId: `bundle-${Date.now()}`,
      createdAt: new Date().toISOString(),
      files: [
        ...sdkExport.files.map((file) => path.join(outputDir, path.relative(sdkExport.outputDir, file))),
        provenanceFile,
        ...smokeEntries.filter((entry): entry is string => Boolean(entry))
      ],
      notes: [
        'Delivery bundle contains verified implementation files plus smoke test entries.',
        `Built from regression run ${regression.runId}.`,
        `Task snapshot count at assembly time: ${files.length}.`,
        ...(options.deliveryContext
          ? [`Delivery context ${options.deliveryContext.contextId} was attached as handoff provenance; gates remain deterministic.`]
          : [])
      ],
      outputDir,
      provenanceFile,
      smokeEntry: smokeEntries[0] ?? null,
      target,
      taskId: options.taskId,
      deliveryContextUsed: options.deliveryContext ?? null,
      compareAnchorUsed: options.deliveryContext?.compareAnchor ?? null,
      patchPreflightUsed: options.deliveryContext?.patchPreflight ?? null,
      rebuildContextUsed: options.deliveryContext?.rebuildContext ?? null,
      purePreflightUsed: options.deliveryContext?.purePreflight ?? null,
      aiAugmentationUsed: options.deliveryContext?.aiAugmentation ?? null
    };

    await this.deps.evidenceStore.writeSnapshot(options.taskId, 'delivery/bundle', bundle);
    await this.deps.taskManifestManager.updatePointers(options.taskId, {
      deliveryBundle: 'delivery/bundle'
    });
    return bundle;
  }

  private async writeSmokeEntries(outputDir: string, target: 'node' | 'python' | 'dual'): Promise<Array<string | null>> {
    const entries: Array<string | null> = [];

    if (target === 'node' || target === 'dual') {
      const nodeSmoke = path.join(outputDir, 'smoke-node.mjs');
      await writeTextFile(nodeSmoke, `import { computeFromFixture } from './node/index.mjs';

try {
  const result = await computeFromFixture();
  console.log(JSON.stringify({ __jsagent_delivery_result__: result }));
} catch (error) {
  console.error(JSON.stringify({ __jsagent_delivery_error__: { message: error?.message ?? String(error) } }));
  process.exitCode = 1;
}
`);
      entries.push(nodeSmoke);
    }

    if (target === 'python' || target === 'dual') {
      const pythonSmoke = path.join(outputDir, 'smoke_python.py');
      await writeTextFile(pythonSmoke, `import json
import sys
from python.package.client import compute_from_fixture

try:
    result = compute_from_fixture()
    print(json.dumps({"__jsagent_delivery_result__": result}, ensure_ascii=False))
except Exception as exc:
    print(json.dumps({"__jsagent_delivery_error__": {"message": str(exc)}}, ensure_ascii=False), file=sys.stderr)
    sys.exit(1)
`);
      entries.push(pythonSmoke);
    }

    return entries;
  }
}
