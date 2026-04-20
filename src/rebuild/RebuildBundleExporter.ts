import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import type { CodeCollector } from '../collector/CodeCollector.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import { buildEntryCode, buildEnvShimCode } from './templates.js';
import type { RebuildBundleExport, RebuildBundleOptions, RuntimeFixture } from './types.js';
import { nowStamp, safeFileSegment, writeJsonFile, writeTextFile } from './serialization.js';
import type { EnvAccessLogger } from './EnvAccessLogger.js';
import type { FixtureExtractor } from './FixtureExtractor.js';

export class RebuildBundleExporter {
  constructor(
    private readonly deps: {
      codeCollector: CodeCollector;
      evidenceStore: EvidenceStore;
      envAccessLogger: EnvAccessLogger;
      fixtureExtractor: FixtureExtractor;
    }
  ) {}

  async export(options: RebuildBundleOptions = {}, fixture?: RuntimeFixture | null): Promise<RebuildBundleExport> {
    const warnings: string[] = [];
    const entryStrategy = options.entryStrategy ?? 'single-file';
    const bundleDir = await this.resolveBundleDir(options);

    if (await this.exists(bundleDir)) {
      if (options.overwrite) {
        await rm(bundleDir, { recursive: true, force: true });
      } else {
        warnings.push(`Bundle directory already exists and overwrite=false: ${bundleDir}`);
      }
    }
    await mkdir(bundleDir, { recursive: true });

    const selectedFiles = this.selectFiles(options, warnings);
    const targetFiles: string[] = [];
    if (selectedFiles.length === 0) {
      warnings.push('No collected code was available; generated an empty target.js placeholder.');
      const targetPath = path.join(bundleDir, 'target.js');
      await writeTextFile(targetPath, '// No collected code was available for this rebuild bundle.\n');
      targetFiles.push('target.js');
    } else if (entryStrategy === 'top-priority-merged') {
      for (const [index, file] of selectedFiles.entries()) {
        const relativePath = path.join('targets', `${String(index + 1).padStart(2, '0')}-${safeFileSegment(file.url, 'target')}.js`);
        await writeTextFile(path.join(bundleDir, relativePath), `/* Source: ${file.url} */\n${file.content}\n`);
        targetFiles.push(relativePath.replace(/\\/g, '/'));
      }
    } else {
      const file = selectedFiles[0]!;
      await writeTextFile(path.join(bundleDir, 'target.js'), `/* Source: ${file.url} */\n${file.content}\n`);
      targetFiles.push('target.js');
    }

    let fixtureFile: string | null = null;
    let resolvedFixture = fixture ?? null;
    if (options.includeFixture) {
      try {
        resolvedFixture = resolvedFixture ?? (await this.deps.fixtureExtractor.extractFromCurrentPage());
        fixtureFile = 'fixture.json';
        await writeJsonFile(path.join(bundleDir, fixtureFile), resolvedFixture);
      } catch (error) {
        warnings.push(`Fixture extraction failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (options.includeEnvShim ?? true) {
      await writeTextFile(path.join(bundleDir, 'env-shim.js'), `${buildEnvShimCode(resolvedFixture)}\n`);
    }
    if (options.includeAccessLogger ?? true) {
      await writeTextFile(path.join(bundleDir, 'env-access-logger.js'), `${this.deps.envAccessLogger.buildShimCode()}\n`);
    }

    const entryFile = path.join(bundleDir, 'entry.js');
    await writeTextFile(
      entryFile,
      `${buildEntryCode({
        fixtureFile,
        includeAccessLogger: options.includeAccessLogger ?? true,
        includeEnvShim: options.includeEnvShim ?? true,
        targetFiles,
        targetFunctionName: options.targetFunctionName
      })}\n`
    );

    const metadata = {
      accessLoggerIncluded: options.includeAccessLogger ?? true,
      createdAt: new Date().toISOString(),
      entryStrategy,
      envShimIncluded: options.includeEnvShim ?? true,
      fixtureIncluded: Boolean(fixtureFile),
      selectedFiles: selectedFiles.map((file) => ({
        size: file.size,
        type: file.type,
        url: file.url
      })),
      sourceUrl: options.sourceUrl,
      targetFunctionName: options.targetFunctionName,
      warnings
    };
    const metadataFile = path.join(bundleDir, 'metadata.json');
    await writeJsonFile(metadataFile, metadata);

    return {
      bundleDir,
      entryFile,
      fixtureFile: fixtureFile ? path.join(bundleDir, fixtureFile) : null,
      metadataFile,
      targetFiles: targetFiles.map((file) => path.join(bundleDir, file)),
      taskId: options.taskId ?? null,
      warnings
    };
  }

  private async resolveBundleDir(options: RebuildBundleOptions): Promise<string> {
    if (options.taskId) {
      const task = await this.deps.evidenceStore.openTask({
        taskId: options.taskId
      });
      return path.join(task.taskDir, 'env', 'bundle');
    }

    return path.resolve(process.cwd(), 'artifacts', 'rebuild', 'tmp', nowStamp());
  }

  private selectFiles(options: RebuildBundleOptions, warnings: string[]) {
    if (options.topFileUrl) {
      const file = this.deps.codeCollector.getFileByUrl(options.topFileUrl);
      if (file) {
        return [file];
      }
      warnings.push(`topFileUrl was not found in collector cache: ${options.topFileUrl}`);
    }

    const top = this.deps.codeCollector.getTopPriorityFiles(options.topN ?? 5);
    return top.files;
  }

  private async exists(targetPath: string): Promise<boolean> {
    try {
      await stat(targetPath);
      return true;
    } catch {
      return false;
    }
  }
}
