import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { AppError } from '../core/errors.js';
import type { PatchSuggestion } from '../rebuild/types.js';
import type { AppliedPatchRecord } from './types.js';

const PATCH_REGION_START = '// **JSAGENT_PATCH_REGION_START**';
const PATCH_REGION_END = '// **JSAGENT_PATCH_REGION_END**';

export class PatchApplier {
  async apply(options: {
    bundleDir: string;
    suggestion: PatchSuggestion;
    targetFile?: string;
    planId?: string | null;
    taskId?: string | null;
  }): Promise<AppliedPatchRecord> {
    if (!options.suggestion.suggestedCode?.trim()) {
      throw new AppError('PATCH_CODE_NOT_AVAILABLE', 'Selected patch suggestion does not include suggestedCode.', {
        target: options.suggestion.target
      });
    }

    const relativeTarget = options.targetFile ?? 'env-shim.js';
    const targetPath = path.resolve(options.bundleDir, relativeTarget);
    const bundleRoot = path.resolve(options.bundleDir);
    const relativeToBundle = path.relative(bundleRoot, targetPath);
    if (relativeToBundle.startsWith('..') || path.isAbsolute(relativeToBundle)) {
      throw new AppError('PATCH_TARGET_OUTSIDE_BUNDLE', 'Patch target must stay inside the rebuild bundle directory.', {
        bundleDir: options.bundleDir,
        targetFile: relativeTarget
      });
    }

    let source: string;
    try {
      source = await readFile(targetPath, 'utf8');
    } catch (error) {
      throw new AppError('PATCH_TARGET_NOT_FOUND', `Patch target file was not found: ${relativeTarget}`, {
        cause: error instanceof Error ? error.message : String(error),
        targetFile: relativeTarget
      });
    }

    const patchCode = options.suggestion.suggestedCode.trim();
    const patchId = `patch-${randomUUID()}`;
    if (source.includes(patchCode)) {
      return {
        appliedAt: new Date().toISOString(),
        basedOn: [...options.suggestion.basedOn, 'dedupe:suggestedCode'],
        deduplicated: true,
        patchId,
        patchType: options.suggestion.patchType,
        planId: options.planId ?? null,
        reason: `${options.suggestion.reason} Already present in patch target; skipped duplicate append.`,
        status: 'applied',
        suggestedCode: options.suggestion.suggestedCode,
        target: options.suggestion.target,
        taskId: options.taskId ?? null
      };
    }

    const snippet = [
      '',
      `// JSAgent patch ${patchId}: ${options.suggestion.target}`,
      patchCode,
      ''
    ].join('\n');

    const nextSource = this.insertPatch(source, snippet);
    await writeFile(targetPath, nextSource, 'utf8');

    return {
      appliedAt: new Date().toISOString(),
      basedOn: options.suggestion.basedOn,
      patchId,
      patchType: options.suggestion.patchType,
      planId: options.planId ?? null,
      reason: options.suggestion.reason,
      status: 'applied',
      suggestedCode: options.suggestion.suggestedCode,
      target: options.suggestion.target,
      taskId: options.taskId ?? null
    };
  }

  private insertPatch(source: string, snippet: string): string {
    if (source.includes(PATCH_REGION_START) && source.includes(PATCH_REGION_END)) {
      return source.replace(PATCH_REGION_END, `${snippet}${PATCH_REGION_END}`);
    }

    return `${source.trimEnd()}\n${PATCH_REGION_START}\n${snippet}${PATCH_REGION_END}\n`;
  }
}
