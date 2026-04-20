import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function nowStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function toJsonLiteral(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? 'null';
}
