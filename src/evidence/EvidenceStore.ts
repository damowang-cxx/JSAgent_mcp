import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { AppError } from '../core/errors.js';
import type { EvidenceLogName, OpenTaskInput, OpenTaskResult, ReverseTaskDescriptor } from './types.js';

const ARTIFACT_LOG_FILES: readonly EvidenceLogName[] = ['runtime-evidence', 'network', 'hooks', 'acceptance'] as const;

function nowIso(): string {
  return new Date().toISOString();
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

function assertSafeSegment(name: string, label: string): void {
  if (name.length === 0 || name.includes('..') || /[\\/]/.test(name)) {
    throw new AppError('INVALID_PATH_SEGMENT', `Invalid ${label}: ${name}`, {
      [label]: name
    });
  }
}

export class EvidenceStore {
  readonly rootDir: string;

  constructor(rootDir = path.resolve(process.cwd(), 'artifacts', 'tasks')) {
    this.rootDir = rootDir;
  }

  async openTask(input: OpenTaskInput): Promise<OpenTaskResult> {
    assertSafeSegment(input.taskId, 'taskId');

    const taskDir = this.getTaskDir(input.taskId);
    const snapshotsDir = path.join(taskDir, 'snapshots');

    await mkdir(taskDir, { recursive: true });
    await mkdir(snapshotsDir, { recursive: true });

    const taskFilePath = path.join(taskDir, 'task.json');
    const existingDescriptor = await this.readDescriptor(taskFilePath);
    const descriptor: ReverseTaskDescriptor = existingDescriptor
      ? {
          ...existingDescriptor,
          goal: input.goal ?? existingDescriptor.goal,
          slug: input.slug ?? existingDescriptor.slug,
          targetUrl: input.targetUrl ?? existingDescriptor.targetUrl,
          updatedAt: nowIso()
        }
      : {
          createdAt: nowIso(),
          goal: input.goal,
          slug: input.slug,
          targetUrl: input.targetUrl,
          taskId: input.taskId,
          updatedAt: nowIso()
        };

    await this.writeJsonFile(taskFilePath, descriptor);
    await this.ensureArtifactFiles(taskDir);

    return {
      descriptor,
      taskDir,
      taskId: descriptor.taskId
    };
  }

  async appendTimeline(taskId: string, event: Record<string, unknown>): Promise<void> {
    await this.ensureTaskExists(taskId);
    await this.appendJsonLine(path.join(this.getTaskDir(taskId), 'timeline.jsonl'), {
      timestamp: nowIso(),
      ...event
    });
    await this.touchTask(taskId);
  }

  async appendLog(taskId: string, name: EvidenceLogName, value: Record<string, unknown>): Promise<void> {
    await this.ensureTaskExists(taskId);
    await this.appendJsonLine(path.join(this.getTaskDir(taskId), `${name}.jsonl`), {
      timestamp: nowIso(),
      ...value
    });
    await this.touchTask(taskId);
  }

  async writeSnapshot(taskId: string, name: string, value: unknown): Promise<void> {
    await this.ensureTaskExists(taskId);
    assertSafeSegment(name, 'snapshotName');

    const targetPath = path.join(this.getTaskDir(taskId), 'snapshots', `${name}.json`);
    await this.writeJsonFile(targetPath, value);
    await this.touchTask(taskId);
  }

  async readSnapshot(taskId: string, name: string): Promise<unknown | undefined> {
    await this.ensureTaskExists(taskId);
    assertSafeSegment(name, 'snapshotName');

    const targetPath = path.join(this.getTaskDir(taskId), 'snapshots', `${name}.json`);
    if (!(await pathExists(targetPath))) {
      return undefined;
    }

    const raw = await readFile(targetPath, 'utf8');
    return JSON.parse(raw) as unknown;
  }

  getTaskDir(taskId: string): string {
    assertSafeSegment(taskId, 'taskId');
    return path.join(this.rootDir, taskId);
  }

  private async readDescriptor(taskFilePath: string): Promise<ReverseTaskDescriptor | undefined> {
    if (!(await pathExists(taskFilePath))) {
      return undefined;
    }

    const raw = await readFile(taskFilePath, 'utf8');
    return JSON.parse(raw) as ReverseTaskDescriptor;
  }

  private async touchTask(taskId: string): Promise<void> {
    const taskFilePath = path.join(this.getTaskDir(taskId), 'task.json');
    const descriptor = await this.readDescriptor(taskFilePath);
    if (!descriptor) {
      throw new AppError('TASK_NOT_FOUND', `Reverse task not found: ${taskId}`, { taskId });
    }

    descriptor.updatedAt = nowIso();
    await this.writeJsonFile(taskFilePath, descriptor);
  }

  private async ensureTaskExists(taskId: string): Promise<void> {
    const taskFilePath = path.join(this.getTaskDir(taskId), 'task.json');
    if (!(await pathExists(taskFilePath))) {
      throw new AppError('TASK_NOT_FOUND', `Reverse task not found: ${taskId}`, { taskId });
    }
  }

  private async ensureArtifactFiles(taskDir: string): Promise<void> {
    const fileNames = ['timeline.jsonl', ...ARTIFACT_LOG_FILES.map((name) => `${name}.jsonl`)];

    for (const fileName of fileNames) {
      const filePath = path.join(taskDir, fileName);
      if (!(await pathExists(filePath))) {
        await writeFile(filePath, '', 'utf8');
      }
    }
  }

  private async appendJsonLine(targetPath: string, value: Record<string, unknown>): Promise<void> {
    await appendFile(targetPath, `${JSON.stringify(value)}\n`, 'utf8');
  }

  private async writeJsonFile(targetPath: string, value: unknown): Promise<void> {
    await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }
}
