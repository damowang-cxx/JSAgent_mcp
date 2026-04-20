import { rm } from 'node:fs/promises';
import path from 'node:path';

import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { NodePureScaffold, PureBoundary, PureFixture } from './types.js';
import { buildPureEntryCode, buildPureImplCode, buildPureReadme } from './templates.js';
import { nowStamp, writeJsonFile, writeTextFile } from './serialization.js';

export class PureNodeExtractor {
  constructor(private readonly evidenceStore: EvidenceStore) {}

  async extract(options: {
    taskId?: string;
    targetFunctionName?: string;
    boundary: PureBoundary;
    fixture: PureFixture;
    sourceBundleDir?: string;
    overwrite?: boolean;
  }): Promise<NodePureScaffold> {
    const outputDir = options.taskId
      ? path.join(this.evidenceStore.getTaskDir(options.taskId), 'run', 'node-pure')
      : path.resolve(process.cwd(), 'artifacts', 'pure', 'tmp', nowStamp(), 'node-pure');

    if (options.overwrite) {
      await rm(outputDir, { recursive: true, force: true });
    }

    const entryFile = path.join(outputDir, 'pure-entry.js');
    const implFile = path.join(outputDir, 'pure-impl.js');
    const fixtureFile = path.join(outputDir, 'fixtures.json');
    const readmeFile = path.join(outputDir, 'pure-readme.md');
    const metadataFile = path.join(outputDir, 'metadata.json');

    await writeTextFile(implFile, buildPureImplCode(options.boundary));
    await writeTextFile(entryFile, buildPureEntryCode(options.fixture));
    await writeJsonFile(fixtureFile, options.fixture);
    await writeTextFile(readmeFile, buildPureReadme(options.boundary));
    await writeJsonFile(metadataFile, {
      createdAt: new Date().toISOString(),
      sourceBundleDir: options.sourceBundleDir,
      targetFunctionName: options.targetFunctionName,
      boundary: options.boundary,
      notes: [
        'Node pure scaffold is intentionally incomplete until verify_node_pure passes against fixtures.json.'
      ]
    });

    return {
      createdAt: new Date().toISOString(),
      entryFile,
      files: [entryFile, implFile, fixtureFile, readmeFile, metadataFile],
      fixtureFile,
      notes: [
        'Generated Node-only pure scaffold.',
        'computePure currently contains a deterministic scaffold placeholder, not a completed algorithm.'
      ],
      outputDir,
      taskId: options.taskId ?? null
    };
  }
}
