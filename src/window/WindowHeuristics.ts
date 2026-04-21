import type { RankedCodeFile } from '../collector/types.js';
import { clip, uniqueStrings } from '../scenario/normalization.js';
import type { DependencyWindowNodeKind, DependencyWindowSnippet } from './types.js';

export const SIGNAL_NAME_PATTERN = /\b(sign|signature|xsign|token|accessToken|auth|authorization|nonce|timestamp|challenge|verify|captcha|fingerprint|hmac|hash|md5|sha|aes|rsa|encrypt|cipher|base64|encode)\b/i;
export const FRESHNESS_NAME_PATTERN = /\b(nonce|timestamp|ts|_t|time|token|challenge|verify|captcha|fingerprint)\b/i;
export const OUTPUT_NAME_PATTERN = /\b(sign|signature|x-?sign|auth|authorization|token|verify|challenge|captcha|fingerprint|cipher|enc|hash)\b/i;

const REQUEST_SINK_PATTERN = /\b(fetch|XMLHttpRequest|sendBeacon|axios\.(?:get|post|request)|\$\.(?:ajax|get|post)|WebSocket)\b/g;
const FUNCTION_PATTERN = /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(|\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g;
const CLASS_PATTERN = /\bclass\s+([A-Za-z_$][\w$]*)\b/g;
const VARIABLE_PATTERN = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\b/g;

export function makeWindowId(targetName: string): string {
  const safeName = targetName.replace(/[^A-Za-z0-9_$.-]+/g, '-').slice(0, 80) || 'window';
  return `${safeName}-${Date.now().toString(36)}`;
}

export function makeProbePlanId(targetName: string): string {
  const safeName = targetName.replace(/[^A-Za-z0-9_$.-]+/g, '-').slice(0, 80) || 'probe';
  return `${safeName}-${Date.now().toString(36)}`;
}

export function findTargetSnippets(files: readonly RankedCodeFile[], targetName: string, radius = 2_500): DependencyWindowSnippet[] {
  if (!targetName || targetName === 'unknown-target') {
    return [];
  }

  const escaped = escapeRegExp(targetName);
  const pattern = new RegExp(`\\b${escaped}\\b`, 'g');
  const snippets: DependencyWindowSnippet[] = [];

  for (const file of files) {
    const matches = Array.from(file.content.matchAll(pattern)).slice(0, 4);
    for (const match of matches) {
      const index = match.index ?? 0;
      const start = Math.max(0, index - radius);
      const end = Math.min(file.content.length, index + radius);
      snippets.push({
        endLine: lineNumberAt(file.content, end),
        file: file.url,
        preview: clip(file.content.slice(start, end), 5_000),
        reason: `near target symbol ${targetName}`,
        startLine: lineNumberAt(file.content, start)
      });
    }
  }

  return snippets.slice(0, 8);
}

export function extractFunctionParams(snippets: readonly DependencyWindowSnippet[], targetName: string): string[] {
  const escaped = escapeRegExp(targetName);
  const patterns = [
    new RegExp(`function\\s+${escaped}\\s*\\(([^)]*)\\)`, 'i'),
    new RegExp(`(?:const|let|var)\\s+${escaped}\\s*=\\s*(?:async\\s*)?\\(([^)]*)\\)\\s*=>`, 'i'),
    new RegExp(`(?:const|let|var)\\s+${escaped}\\s*=\\s*(?:async\\s*)?function\\s*\\(([^)]*)\\)`, 'i')
  ];

  for (const snippet of snippets) {
    for (const pattern of patterns) {
      const match = snippet.preview.match(pattern);
      if (match?.[1]) {
        return splitNames(match[1]);
      }
    }
  }

  return [];
}

export function extractAssignments(snippets: readonly DependencyWindowSnippet[], targetName: string): string[] {
  const escaped = escapeRegExp(targetName);
  const values: string[] = [];
  const patterns = [
    new RegExp(`\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${escaped}\\s*\\(`, 'g'),
    new RegExp(`\\b([A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)?)\\s*=\\s*${escaped}\\s*\\(`, 'g')
  ];

  for (const snippet of snippets) {
    for (const pattern of patterns) {
      for (const match of snippet.preview.matchAll(pattern)) {
        if (match[1]) {
          values.push(match[1].split('.').pop()!);
        }
      }
    }
  }

  return uniqueStrings(values, 20);
}

export function extractNearbySymbols(snippets: readonly DependencyWindowSnippet[]): Array<{ name: string; kind: DependencyWindowNodeKind; file?: string; reason: string }> {
  const values: Array<{ name: string; kind: DependencyWindowNodeKind; file?: string; reason: string }> = [];

  for (const snippet of snippets) {
    for (const match of snippet.preview.matchAll(FUNCTION_PATTERN)) {
      const name = match[1] ?? match[2];
      if (name) {
        values.push({ file: snippet.file, kind: 'function', name, reason: 'function symbol appears inside the target dependency window' });
      }
    }
    for (const match of snippet.preview.matchAll(CLASS_PATTERN)) {
      if (match[1]) {
        values.push({ file: snippet.file, kind: 'class', name: match[1], reason: 'class symbol appears inside the target dependency window' });
      }
    }
    for (const match of snippet.preview.matchAll(VARIABLE_PATTERN)) {
      if (match[1] && SIGNAL_NAME_PATTERN.test(match[1])) {
        values.push({ file: snippet.file, kind: 'variable', name: match[1], reason: 'signal-like variable appears inside the target dependency window' });
      }
    }
    for (const match of snippet.preview.matchAll(REQUEST_SINK_PATTERN)) {
      if (match[1]) {
        values.push({ file: snippet.file, kind: 'request-sink', name: match[1], reason: 'request sink appears near the target window' });
      }
    }
  }

  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.kind}:${value.file ?? ''}:${value.name}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  }).slice(0, 30);
}

export function detectExcludedNoise(snippets: readonly DependencyWindowSnippet[], targetUrl?: string): string[] {
  const text = snippets.map((snippet) => snippet.preview).join('\n');
  const values: string[] = [];
  if (/\bdocument\b|\bwindow\b|\blocation\b/.test(text)) {
    values.push('document/window/location accesses should be treated as runtime noise until a probe proves they are algorithm inputs.');
  }
  if (/\bEvent\b|\bevent\b|\btarget\b|\bcurrentTarget\b/.test(text)) {
    values.push('DOM event objects should be excluded from the first helper probe fixture.');
  }
  if (/\blocalStorage\b|\bsessionStorage\b|\bcookie\b|\bcaches\b/.test(text)) {
    values.push('storage, cookie, and cache reads should stay outside the first minimal function window unless they feed a named input.');
  }
  if (/\bconsole\.|\bdebugger\b/.test(text)) {
    values.push('console/debugger branches are not part of the first dependency window.');
  }
  if (/\bsetTimeout\b|\bsetInterval\b|\brequestAnimationFrame\b|\bMath\.random\b/.test(text)) {
    values.push('timers and randomness should be frozen or passed as explicit inputs before pure extraction.');
  }
  if (targetUrl) {
    values.push('non-target request URLs should be ignored while validating this dependency window.');
  }

  return uniqueStrings(values, 12);
}

export function classifyNodeKind(name: string): DependencyWindowNodeKind {
  if (/\b(fetch|XMLHttpRequest|sendBeacon|axios|ajax|WebSocket)\b/i.test(name)) {
    return 'request-sink';
  }
  if (SIGNAL_NAME_PATTERN.test(name)) {
    return 'helper';
  }
  return 'function';
}

export function splitNames(value: string): string[] {
  return uniqueStrings(
    value
      .split(',')
      .map((item) => item.trim().replace(/=.*$/, '').replace(/[{}[\]\s]/g, ''))
      .filter((item) => /^[A-Za-z_$][\w$]*$/.test(item)),
    30
  );
}

function lineNumberAt(content: string, index: number): number {
  return content.slice(0, Math.max(0, index)).split(/\r?\n/).length;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
