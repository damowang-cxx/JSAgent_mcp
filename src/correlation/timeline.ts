import type { HookDataResult } from '../hook/types.js';
import type { NetworkRequestRecord } from '../network/types.js';
import type { HookTimelineEntry } from './types.js';

const SIGNATURE_KEYWORDS = ['sign', 'signature', 'token', 'auth', 'bearer', 'x-sign', 'hmac', 'nonce', 'encrypt', 'hash'];

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function timestampMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return Date.now();
}

function findSignatureIndicators(value: unknown, output = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    for (const keyword of SIGNATURE_KEYWORDS) {
      if (lower.includes(keyword)) {
        output.add(keyword);
      }
    }
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 20)) {
      findSignatureIndicators(item, output);
    }
    return output;
  }

  const record = toRecord(value);
  if (record) {
    for (const [key, item] of Object.entries(record).slice(0, 30)) {
      findSignatureIndicators(key, output);
      findSignatureIndicators(item, output);
    }
  }

  return output;
}

export function buildHookTimeline(hookData: HookDataResult): HookTimelineEntry[] {
  const timeline: HookTimelineEntry[] = [];

  for (const [hookId, records] of Object.entries(hookData.records)) {
    for (const rawRecord of records) {
      const record = toRecord(rawRecord) ?? {};
      const timestamp = timestampMs(record.timestamp);
      const target = asString(record.targetPath) ?? asString(record.type) ?? asString(record.target) ?? 'unknown';
      const url = asString(record.url) ?? asString(toRecord(record.request)?.url);
      const method = (asString(record.method) ?? asString(toRecord(record.request)?.method))?.toUpperCase();
      const event = asString(record.event) ?? asString(record.type) ?? target;

      timeline.push({
        event,
        hookId,
        method,
        raw: record,
        signatureIndicators: Array.from(findSignatureIndicators(record)).sort(),
        source: 'hook',
        status: asNumber(record.status),
        target,
        timestamp,
        timestampIso: new Date(timestamp).toISOString(),
        url
      });
    }
  }

  return timeline.sort((left, right) => left.timestamp - right.timestamp);
}

export function networkRecordsToTimeline(records: readonly NetworkRequestRecord[]): HookTimelineEntry[] {
  return records.map((record) => {
    const timestamp = timestampMs(record.startedAt);
    return {
      event: record.resourceType,
      hookId: 'network',
      method: record.method.toUpperCase(),
      networkRequestId: record.id,
      raw: record as unknown as Record<string, unknown>,
      signatureIndicators: Array.from(findSignatureIndicators(record)).sort(),
      source: 'network',
      status: record.status,
      target: record.resourceType || 'request',
      timestamp,
      timestampIso: new Date(timestamp).toISOString(),
      url: record.url
    };
  });
}
