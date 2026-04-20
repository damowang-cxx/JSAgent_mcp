import { appendFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { AppError } from '../core/errors.js';
import type { EvidenceLogName, OpenTaskInput, OpenTaskResult, ReverseTaskDescriptor } from './types.js';

const ARTIFACT_LOG_FILES: readonly EvidenceLogName[] = [
  'runtime-evidence',
  'network',
  'hooks',
  'acceptance',
  'regression-baselines',
  'regression'
] as const;

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

function assertSafeSnapshotName(name: string): void {
  const normalized = name.replace(/\\/g, '/');
  if (
    normalized.length === 0 ||
    normalized.startsWith('/') ||
    normalized.includes('..') ||
    normalized.split('/').some((segment) => segment.length === 0)
  ) {
    throw new AppError('INVALID_SNAPSHOT_NAME', `Invalid snapshotName: ${name}`, {
      snapshotName: name
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
    assertSafeSnapshotName(name);

    const targetPath = this.resolveSnapshotPath(taskId, name);
    await this.writeJsonFile(targetPath, value);
    await this.touchTask(taskId);
  }

  async readLog(taskId: string, name: EvidenceLogName): Promise<Array<Record<string, unknown>>> {
    await this.ensureTaskExists(taskId);

    const targetPath = path.join(this.getTaskDir(taskId), `${name}.jsonl`);
    if (!(await pathExists(targetPath))) {
      return [];
    }

    const raw = await readFile(targetPath, 'utf8');
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        try {
          const parsed = JSON.parse(line) as unknown;
          return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : { value: parsed };
        } catch {
          return {
            parseError: true,
            raw: line
          };
        }
      });
  }

  async readSnapshot(taskId: string, name: string): Promise<unknown | undefined> {
    await this.ensureTaskExists(taskId);
    assertSafeSnapshotName(name);

    const targetPath = this.resolveSnapshotPath(taskId, name);
    if (!(await pathExists(targetPath))) {
      return undefined;
    }

    const raw = await readFile(targetPath, 'utf8');
    return JSON.parse(raw) as unknown;
  }

  async readTaskDescriptor(taskId: string): Promise<ReverseTaskDescriptor | undefined> {
    const taskFilePath = path.join(this.getTaskDir(taskId), 'task.json');
    return await this.readDescriptor(taskFilePath);
  }

  async listLogs(taskId: string): Promise<EvidenceLogName[]> {
    await this.ensureTaskExists(taskId);
    const taskDir = this.getTaskDir(taskId);
    const entries = await readdir(taskDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
      .map((entry) => entry.name.replace(/\.jsonl$/, '') as EvidenceLogName)
      .filter((name): name is EvidenceLogName => ARTIFACT_LOG_FILES.includes(name));
  }

  async listSnapshots(taskId: string): Promise<string[]> {
    await this.ensureTaskExists(taskId);
    const snapshotRoot = path.join(this.getTaskDir(taskId), 'snapshots');
    if (!(await pathExists(snapshotRoot))) {
      return [];
    }

    return await this.listSnapshotFiles(snapshotRoot, snapshotRoot);
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

  private resolveSnapshotPath(taskId: string, name: string): string {
    const normalized = name.replace(/\\/g, '/');
    const snapshotRoot = path.join(this.getTaskDir(taskId), 'snapshots');
    const targetPath = path.resolve(snapshotRoot, `${normalized}.json`);
    const relative = path.relative(snapshotRoot, targetPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new AppError('INVALID_SNAPSHOT_NAME', `Invalid snapshotName: ${name}`, {
        snapshotName: name
      });
    }
    return targetPath;
  }

  private async writeJsonFile(targetPath: string, value: unknown): Promise<void> {
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }

  private async listSnapshotFiles(root: string, currentDir: string): Promise<string[]> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    const names: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        names.push(...await this.listSnapshotFiles(root, fullPath));
        continue;
      }

      if (entry.isFile() && entry.name.endsWith('.json')) {
        names.push(path.relative(root, fullPath).replace(/\\/g, '/').replace(/\.json$/, ''));
      }
    }

    return names.sort();
  }
}
