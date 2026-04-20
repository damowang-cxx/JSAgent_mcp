import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function nowStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function safeFileSegment(value: string, fallback: string): string {
  const normalized = value
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return normalized || fallback;
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
