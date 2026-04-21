export type FieldSource = 'url' | 'header' | 'body-field';

export interface ExtractedField {
  name: string;
  value?: string;
  source: FieldSource;
}

export function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return undefined;
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function confidence(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

export function clip(value: string, maxLength = 180): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...[truncated]`;
}

export function uniqueStrings(values: readonly string[], limit = Number.POSITIVE_INFINITY): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(normalized);
    if (output.length >= limit) {
      break;
    }
  }

  return output;
}

export function dedupeBy<T>(values: readonly T[], getKey: (value: T) => string): T[] {
  const seen = new Set<string>();
  const output: T[] = [];

  for (const value of values) {
    const key = getKey(value);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(value);
  }

  return output;
}

export function normalizeUrlPattern(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl, 'http://relative.local');
    const origin = /^[a-z][a-z0-9+.-]*:\/\//i.test(rawUrl) ? parsed.origin : '';
    const path = parsed.pathname
      .replace(/\/\d{2,}(?=\/|$)/g, '/:num')
      .replace(/\/[a-f0-9]{8,}(?=\/|$)/gi, '/:hex');
    const queryKeys = Array.from(parsed.searchParams.keys()).sort();
    const query = queryKeys.length > 0 ? `?${queryKeys.join('&')}` : '';
    return `${origin}${path || '/'}${query}`;
  } catch {
    return rawUrl
      .split('#')[0]!
      .replace(/\?.*$/, '')
      .replace(/\/\d{2,}(?=\/|$)/g, '/:num')
      .replace(/\/[a-f0-9]{8,}(?=\/|$)/gi, '/:hex');
  }
}

export function targetMatches(url: string, targetUrl?: string): boolean {
  if (!targetUrl || targetUrl.trim().length === 0) {
    return true;
  }

  const target = targetUrl.trim();
  if (url.includes(target) || target.includes(url)) {
    return true;
  }

  try {
    const parsedUrl = new URL(url, 'http://relative.local');
    const parsedTarget = new URL(target, parsedUrl.origin);
    return parsedUrl.origin === parsedTarget.origin && parsedUrl.pathname === parsedTarget.pathname;
  } catch {
    return normalizeUrlPattern(url) === normalizeUrlPattern(target);
  }
}

export function extractUrlFields(rawUrl: string): ExtractedField[] {
  try {
    const parsed = new URL(rawUrl, 'http://relative.local');
    return Array.from(parsed.searchParams.entries()).map(([name, value]) => ({
      name,
      source: 'url' as const,
      value: clip(value, 120)
    }));
  } catch {
    return [];
  }
}

export function extractHeaderFields(headers: Record<string, string> | undefined): ExtractedField[] {
  if (!headers) {
    return [];
  }

  return Object.entries(headers).map(([name, value]) => ({
    name,
    source: 'header' as const,
    value: clip(value, 120)
  }));
}

export function extractBodyFields(postData: string | null | undefined): ExtractedField[] {
  if (!postData || postData.trim().length === 0) {
    return [];
  }

  const trimmed = postData.trim();
  const fields: ExtractedField[] = [];

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      collectJsonFields(parsed, fields);
      if (fields.length > 0) {
        return fields.slice(0, 80);
      }
    } catch {
      // Fall through to urlencoded and loose key matching.
    }
  }

  try {
    const params = new URLSearchParams(trimmed);
    for (const [name, value] of params.entries()) {
      fields.push({
        name,
        source: 'body-field',
        value: clip(value, 120)
      });
    }
    if (fields.length > 0) {
      return fields.slice(0, 80);
    }
  } catch {
    // Fall through to loose key matching.
  }

  const looseFieldPattern = /["']?([A-Za-z_$][\w$-]{1,40})["']?\s*[:=]/g;
  for (const match of trimmed.matchAll(looseFieldPattern)) {
    if (match[1]) {
      fields.push({
        name: match[1],
        source: 'body-field'
      });
    }
    if (fields.length >= 80) {
      break;
    }
  }

  return fields;
}

export function requestText(input: {
  url: string;
  method: string;
  postData?: string | null;
  requestHeaders?: Record<string, string>;
}): string {
  return [
    input.method,
    input.url,
    input.postData ?? '',
    ...Object.entries(input.requestHeaders ?? {}).flatMap(([key, value]) => [key, value])
  ].join('\n');
}

export function unknownToSearchText(value: unknown, maxDepth = 4): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();

  const visit = (current: unknown, depth: number): void => {
    if (parts.length > 500 || depth > maxDepth) {
      return;
    }

    if (typeof current === 'string') {
      parts.push(current);
      return;
    }

    if (typeof current === 'number' || typeof current === 'boolean') {
      parts.push(String(current));
      return;
    }

    if (!current || typeof current !== 'object') {
      return;
    }

    if (seen.has(current)) {
      return;
    }
    seen.add(current);

    if (Array.isArray(current)) {
      for (const item of current.slice(0, 30)) {
        visit(item, depth + 1);
      }
      return;
    }

    for (const [key, item] of Object.entries(current as Record<string, unknown>).slice(0, 60)) {
      parts.push(key);
      visit(item, depth + 1);
    }
  };

  visit(value, 0);
  return parts.join('\n');
}

export function extractStringLiterals(value: string, limit = 40): string[] {
  const literals: string[] = [];
  const pattern = /(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g;

  for (const match of value.matchAll(pattern)) {
    const literal = match[2];
    if (literal && literal.length > 0) {
      literals.push(literal);
    }
    if (literals.length >= limit) {
      break;
    }
  }

  return literals;
}

function collectJsonFields(value: unknown, output: ExtractedField[], prefix = ''): void {
  if (output.length >= 80) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 20)) {
      collectJsonFields(item, output, prefix);
    }
    return;
  }

  const record = toRecord(value);
  if (!record) {
    return;
  }

  for (const [key, item] of Object.entries(record)) {
    const name = prefix ? `${prefix}.${key}` : key;
    output.push({
      name,
      source: 'body-field',
      value: typeof item === 'string' ? clip(item, 120) : undefined
    });

    if (toRecord(item) || Array.isArray(item)) {
      collectJsonFields(item, output, name);
    }

    if (output.length >= 80) {
      return;
    }
  }
}
