import { rm } from 'node:fs/promises';
import path from 'node:path';

import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { NodePureScaffold, PureFixture } from '../pure/types.js';
import type { PythonPureScaffold } from './types.js';
import { buildPythonEntryCode, buildPythonImplCode, buildPythonReadme } from './templates.js';
import { nowStamp, writeJsonFile, writeTextFile } from './serialization.js';

export class PythonPortExtractor {
  constructor(private readonly evidenceStore: EvidenceStore) {}

  async extract(options: {
    taskId?: string;
    nodePure: NodePureScaffold;
    fixture: PureFixture;
    overwrite?: boolean;
  }): Promise<PythonPureScaffold> {
    const outputDir = options.taskId
      ? path.join(this.evidenceStore.getTaskDir(options.taskId), 'run', 'python-pure')
      : path.resolve(process.cwd(), 'artifacts', 'port', 'tmp', nowStamp(), 'python-pure');

    if (options.overwrite) {
      await rm(outputDir, { recursive: true, force: true });
    }

    const entryFile = path.join(outputDir, 'pure_entry.py');
    const implFile = path.join(outputDir, 'pure_impl.py');
    const fixtureFile = path.join(outputDir, 'fixtures.json');
    const readmeFile = path.join(outputDir, 'pure_readme.md');
    const metadataFile = path.join(outputDir, 'metadata.json');

    await writeTextFile(implFile, buildPythonImplCode(options.fixture));
    await writeTextFile(entryFile, buildPythonEntryCode());
    await writeJsonFile(fixtureFile, options.fixture);
    await writeTextFile(readmeFile, buildPythonReadme(options.nodePure, options.fixture));
    await writeJsonFile(metadataFile, {
      createdAt: new Date().toISOString(),
      sourceNodePure: options.nodePure,
      notes: [
        'Python scaffold is generated from the Node pure boundary contract.',
        'This is not an automatic Node-to-Python translation.',
        'Treat the scaffold as incomplete until verify_python_pure passes against the same fixture.'
      ]
    });

    return {
      createdAt: new Date().toISOString(),
      entryFile,
      files: [entryFile, implFile, fixtureFile, readmeFile, metadataFile],
      fixtureFile,
      implFile,
      notes: [
        'Generated Python pure scaffold from Node pure baseline.',
        'compute_pure mirrors the boundary contract and must be strengthened manually if verification diverges.'
      ],
      outputDir,
      taskId: options.taskId ?? null
    };
  }
}
