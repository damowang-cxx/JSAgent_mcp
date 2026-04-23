import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import { AppError } from '../core/errors.js';
import type { ObjectInspectionResult } from './types.js';

export class ObjectInspector {
  constructor(private readonly deps: { browserSession: BrowserSessionManager }) {}

  async inspect(options: {
    targetExpression: string;
    maxDepth?: number;
    maxProperties?: number;
  }): Promise<ObjectInspectionResult> {
    const targetExpression = options.targetExpression.trim();
    if (!targetExpression) {
      throw new AppError('OBJECT_INSPECTION_TARGET_REQUIRED', 'inspect_object requires a non-empty targetExpression.');
    }

    const page = await this.deps.browserSession.getSelectedPage();
    const result = await page.evaluate(inspectObjectInPage, {
      maxDepth: Math.max(0, Math.min(4, Math.floor(options.maxDepth ?? 1))),
      maxProperties: Math.max(1, Math.min(200, Math.floor(options.maxProperties ?? 50))),
      targetExpression
    });
    if (!result.ok) {
      throw new AppError('OBJECT_INSPECTION_FAILED', result.error ?? 'Object inspection failed.', {
        targetExpression
      });
    }

    return result.value;
  }
}

function inspectObjectInPage(input: {
  targetExpression: string;
  maxDepth: number;
  maxProperties: number;
}): {
  ok: true;
  value: ObjectInspectionResult;
} | {
  ok: false;
  error: string;
} {
  let value: unknown;
  try {
    value = (0, eval)(input.targetExpression);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      ok: false
    };
  }

  return {
    ok: true,
    value: {
      inspectedAt: new Date().toISOString(),
      preview: previewValue(value, input.maxDepth),
      properties: inspectProperties(value, input.maxDepth, input.maxProperties),
      prototypeChain: prototypeChain(value),
      targetExpression: input.targetExpression
    }
  };
}

function inspectProperties(value: unknown, maxDepth: number, maxProperties: number) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    return [];
  }

  const names = Object.getOwnPropertyNames(value).slice(0, maxProperties);
  return names.map((name) => {
    try {
      const propertyValue = (value as Record<string, unknown>)[name];
      return {
        name,
        preview: previewValue(propertyValue, maxDepth),
        truncated: isTruncated(propertyValue, maxDepth),
        valueType: valueType(propertyValue)
      };
    } catch (error) {
      return {
        name,
        preview: error instanceof Error ? error.message : String(error),
        truncated: true,
        valueType: 'unreadable'
      };
    }
  });
}

function previewValue(value: unknown, maxDepth: number, depth = 0): string {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  const type = typeof value;
  if (type === 'string') {
    const text = value as string;
    return text.length > 500 ? `${text.slice(0, 500)}...[truncated]` : text;
  }
  if (type === 'number' || type === 'boolean' || type === 'bigint') {
    return String(value);
  }
  if (type === 'function') {
    return `[Function ${(value as { name?: string }).name || 'anonymous'}]`;
  }
  if (depth >= maxDepth) {
    return Array.isArray(value) ? `[Array(${value.length})]` : `[${constructorName(value)}]`;
  }
  if (Array.isArray(value)) {
    return `[${value.slice(0, 10).map((item) => previewValue(item, maxDepth, depth + 1)).join(', ')}${value.length > 10 ? ', ...' : ''}]`;
  }
  const entries = Object.keys(value as Record<string, unknown>).slice(0, 10).map((key) => {
    try {
      return `${key}: ${previewValue((value as Record<string, unknown>)[key], maxDepth, depth + 1)}`;
    } catch {
      return `${key}: [Unreadable]`;
    }
  });
  return `{ ${entries.join(', ')}${Object.keys(value as Record<string, unknown>).length > entries.length ? ', ...' : ''} }`;
}

function prototypeChain(value: unknown): string[] {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    return [];
  }
  const chain: string[] = [];
  let proto = Object.getPrototypeOf(value);
  while (proto && chain.length < 8) {
    chain.push(constructorName(proto));
    proto = Object.getPrototypeOf(proto);
  }
  return chain;
}

function valueType(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value === 'object' || typeof value === 'function'
    ? constructorName(value)
    : typeof value;
}

function constructorName(value: unknown): string {
  return (value as { constructor?: { name?: string } })?.constructor?.name ?? 'Object';
}

function isTruncated(value: unknown, maxDepth: number): boolean {
  if (typeof value === 'string') {
    return value.length > 500;
  }
  return Boolean(value && (typeof value === 'object' || typeof value === 'function') && maxDepth <= 0);
}
