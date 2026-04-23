import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import { AppError } from '../core/errors.js';
import type { FunctionHookRecord, FunctionTraceRecord } from './types.js';

const STORE_KEY = '__JSAGENT_FUNCTION_SCALPEL__';
const MAX_PAGE_TRACES = 700;

function nowIso(): string {
  return new Date().toISOString();
}

export class FunctionHookManager {
  private counter = 0;
  private readonly hooks = new Map<string, FunctionHookRecord>();

  constructor(private readonly deps: { browserSession: BrowserSessionManager }) {}

  async hook(options: {
    targetExpression: string;
    mode?: 'hook' | 'trace';
    urlFilter?: string;
    logArgs?: boolean;
    logResult?: boolean;
    logStack?: boolean;
    pauseOnCall?: boolean;
  }): Promise<FunctionHookRecord> {
    const targetExpression = options.targetExpression.trim();
    if (!targetExpression) {
      throw new AppError('FUNCTION_TARGET_REQUIRED', 'hook_function requires a non-empty targetExpression.');
    }

    const page = await this.deps.browserSession.getSelectedPage();
    if (options.urlFilter && !page.url().includes(options.urlFilter)) {
      throw new AppError('FUNCTION_HOOK_URL_FILTER_MISMATCH', 'Selected page URL does not match urlFilter.', {
        pageUrl: page.url(),
        urlFilter: options.urlFilter
      });
    }

    const item: FunctionHookRecord = {
      createdAt: nowIso(),
      enabled: true,
      hookId: `function-scalpel-${++this.counter}`,
      mode: options.mode ?? 'hook',
      options: {
        logArgs: options.logArgs ?? true,
        logResult: options.logResult ?? true,
        logStack: Boolean(options.logStack),
        pauseOnCall: Boolean(options.pauseOnCall)
      },
      targetExpression,
      ...(options.urlFilter ? { urlFilter: options.urlFilter } : {})
    };

    const injected = await page.evaluate(installFunctionScalpelHook, {
      hook: item,
      maxRecords: MAX_PAGE_TRACES,
      storeKey: STORE_KEY
    });
    if (!injected.ok) {
      throw new AppError('FUNCTION_HOOK_FAILED', injected.error ?? 'Failed to install function hook.', {
        hookId: item.hookId,
        targetExpression
      });
    }

    this.hooks.set(item.hookId, item);
    return { ...item, options: item.options ? { ...item.options } : undefined };
  }

  list(): FunctionHookRecord[] {
    return Array.from(this.hooks.values())
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((item) => ({ ...item, options: item.options ? { ...item.options } : undefined }));
  }

  async remove(hookId: string): Promise<boolean> {
    const existed = this.hooks.has(hookId);
    const page = await this.deps.browserSession.getSelectedPage();
    let removedFromPage = false;
    try {
      const result = await page.evaluate(removeFunctionScalpelHook, {
        hookId,
        storeKey: STORE_KEY
      });
      removedFromPage = Boolean(result.removed);
    } catch {
      removedFromPage = false;
    }

    this.hooks.delete(hookId);
    return existed || removedFromPage;
  }

  async collectTraceRecords(): Promise<FunctionTraceRecord[]> {
    const page = await this.deps.browserSession.getSelectedPage();
    try {
      const records = await page.evaluate(({ storeKey }) => {
        const root = window as unknown as Record<string, unknown>;
        const store = root[storeKey] as { traces?: FunctionTraceRecord[] } | undefined;
        return Array.isArray(store?.traces) ? store.traces : [];
      }, {
        storeKey: STORE_KEY
      });
      return records.map((record) => ({ ...record }));
    } catch {
      return [];
    }
  }

  async clearPageTraceRecords(options: { hookId?: string } = {}): Promise<void> {
    const page = await this.deps.browserSession.getSelectedPage();
    await page.evaluate(({ hookId, storeKey }) => {
      const root = window as unknown as Record<string, unknown>;
      const store = root[storeKey] as { traces?: FunctionTraceRecord[] } | undefined;
      if (!store || !Array.isArray(store.traces)) {
        return;
      }
      if (!hookId) {
        store.traces = [];
        return;
      }
      store.traces = store.traces.filter((record) => record.hookId !== hookId);
    }, {
      hookId: options.hookId,
      storeKey: STORE_KEY
    });
  }
}

type InstallHookInput = {
  hook: FunctionHookRecord;
  maxRecords: number;
  storeKey: string;
};

type InstallHookResult = {
  ok: boolean;
  error?: string;
};

function installFunctionScalpelHook(input: InstallHookInput): InstallHookResult {
  const root = window as unknown as Record<string, unknown>;
  const store = ensureFunctionScalpelStore(root, input.storeKey);
  const resolved = resolveTargetPath(input.hook.targetExpression);
  if (!resolved.ok) {
    return {
      error: resolved.error,
      ok: false
    };
  }

  const stateKey = input.hook.targetExpression;
  let state = store.targets[stateKey];
  const current = resolved.parent[resolved.property];
  if (!state) {
    const currentWrapper = current as WrappedFunction | undefined;
    const original = typeof currentWrapper?.__jsagentFunctionScalpelOriginal === 'function'
      ? currentWrapper.__jsagentFunctionScalpelOriginal
      : current;
    if (typeof original !== 'function') {
      return {
        error: 'Target not found or not callable.',
        ok: false
      };
    }
    const originalFunction = original as (...args: unknown[]) => unknown;

    state = {
      hookIds: [],
      original: originalFunction,
      property: resolved.property,
      targetExpression: input.hook.targetExpression
    };
    store.targets[stateKey] = state;

    const wrapped = function jsagentFunctionScalpelWrapper(this: unknown, ...args: unknown[]) {
      const hookIds = state.hookIds.slice();
      const activeHooks = hookIds
        .map((hookId) => store.hooks[hookId])
        .filter((hook): hook is FunctionHookRecord => Boolean(hook?.enabled));
      const startedAt = new Date().toISOString();

      for (const hook of activeHooks) {
        if (hook.options?.pauseOnCall) {
          debugger;
          break;
        }
      }

      const buildBaseRecord = (hook: FunctionHookRecord): FunctionTraceRecord => ({
        calledAt: startedAt,
        hookId: hook.hookId,
        targetExpression: hook.targetExpression,
        traceId: `${hook.hookId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        ...(hook.options?.logArgs ? { argsPreview: safeSerializeArray(args) } : {}),
        ...(hook.options?.logStack ? { stackPreview: stackPreview() } : {})
      });

      try {
        const result = state.original.apply(this, args);
        if (result && typeof result === 'object' && typeof (result as Promise<unknown>).then === 'function') {
          return (result as Promise<unknown>).then((resolvedValue) => {
            for (const hook of activeHooks) {
              pushTrace(store, {
                ...buildBaseRecord(hook),
                ...(hook.options?.logResult ? { resultPreview: safeSerialize(resolvedValue) } : {})
              }, input.maxRecords);
            }
            return resolvedValue;
          }).catch((error) => {
            for (const hook of activeHooks) {
              pushTrace(store, {
                ...buildBaseRecord(hook),
                error: errorMessage(error)
              }, input.maxRecords);
            }
            throw error;
          });
        }

        for (const hook of activeHooks) {
          pushTrace(store, {
            ...buildBaseRecord(hook),
            ...(hook.options?.logResult ? { resultPreview: safeSerialize(result) } : {})
          }, input.maxRecords);
        }
        return result;
      } catch (error) {
        for (const hook of activeHooks) {
          pushTrace(store, {
            ...buildBaseRecord(hook),
            error: errorMessage(error)
          }, input.maxRecords);
        }
        throw error;
      }
    };

    Object.defineProperty(wrapped, '__jsagentFunctionScalpelOriginal', {
      configurable: true,
      enumerable: false,
      value: state.original
    });
    Object.defineProperty(wrapped, '__jsagentFunctionScalpelStateKey', {
      configurable: true,
      enumerable: false,
      value: stateKey
    });

    try {
      resolved.parent[resolved.property] = wrapped;
    } catch (error) {
      delete store.targets[stateKey];
      return {
        error: `Failed to wrap target property: ${errorMessage(error)}`,
        ok: false
      };
    }
  }

  if (!state.hookIds.includes(input.hook.hookId)) {
    state.hookIds.push(input.hook.hookId);
  }
  store.hooks[input.hook.hookId] = input.hook;
  return { ok: true };
}

function removeFunctionScalpelHook(input: { hookId: string; storeKey: string }): { removed: boolean } {
  const root = window as unknown as Record<string, unknown>;
  const store = root[input.storeKey] as FunctionScalpelPageStore | undefined;
  if (!store) {
    return { removed: false };
  }

  const hook = store.hooks[input.hookId];
  if (!hook) {
    return { removed: false };
  }

  delete store.hooks[input.hookId];
  const state = store.targets[hook.targetExpression];
  if (state) {
    state.hookIds = state.hookIds.filter((hookId) => hookId !== input.hookId);
    if (state.hookIds.length === 0) {
      const resolved = resolveTargetPath(hook.targetExpression);
      const wrapped = resolved.ok ? resolved.parent[resolved.property] as WrappedFunction | undefined : undefined;
      if (resolved.ok && wrapped?.__jsagentFunctionScalpelStateKey === hook.targetExpression) {
        try {
          resolved.parent[resolved.property] = state.original;
        } catch {
          // Leave runtime cleanup best-effort; the registry still forgets the hook.
        }
      }
      delete store.targets[hook.targetExpression];
    }
  }

  return { removed: true };
}

type TargetState = {
  hookIds: string[];
  original: (...args: unknown[]) => unknown;
  property: string;
  targetExpression: string;
};

type WrappedFunction = ((...args: unknown[]) => unknown) & {
  __jsagentFunctionScalpelOriginal?: (...args: unknown[]) => unknown;
  __jsagentFunctionScalpelStateKey?: string;
};

type FunctionScalpelPageStore = {
  hooks: Record<string, FunctionHookRecord>;
  targets: Record<string, TargetState>;
  traces: FunctionTraceRecord[];
};

type ResolveTargetResult = {
  ok: true;
  parent: Record<string, unknown>;
  property: string;
} | {
  ok: false;
  error: string;
};

function ensureFunctionScalpelStore(root: Record<string, unknown>, storeKey: string): FunctionScalpelPageStore {
  if (!root[storeKey] || typeof root[storeKey] !== 'object') {
    root[storeKey] = {
      hooks: {},
      targets: {},
      traces: []
    };
  }

  const store = root[storeKey] as Partial<FunctionScalpelPageStore>;
  store.hooks ??= {};
  store.targets ??= {};
  store.traces ??= [];
  return store as FunctionScalpelPageStore;
}

function resolveTargetPath(expression: string): ResolveTargetResult {
  const segments = parsePath(expression);
  if (segments.length === 0) {
    return {
      error: 'Only dotted or bracketed object paths are supported.',
      ok: false
    };
  }

  if (segments[0] === 'window') {
    segments.shift();
  }

  if (segments.length === 0) {
    return {
      error: 'Target path must include a property name.',
      ok: false
    };
  }

  let scope: unknown = window as unknown as Record<string, unknown>;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index] as string;
    if (!scope || typeof scope !== 'object' || !(key in scope)) {
      return {
        error: `Path segment not found: ${key}`,
        ok: false
      };
    }
    scope = (scope as Record<string, unknown>)[key];
  }

  const property = segments[segments.length - 1] as string;
  if (!scope || typeof scope !== 'object' || !(property in scope)) {
    return {
      error: `Target property not found: ${property}`,
      ok: false
    };
  }

  return {
    ok: true,
    parent: scope as Record<string, unknown>,
    property
  };
}

function parsePath(expression: string): string[] {
  const trimmed = expression.trim();
  if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[['"][^'"]+['"]\]|\["[^"]+"\]|\['[^']+'\])*$/.test(trimmed)) {
    return [];
  }

  const segments: string[] = [];
  const pattern = /(?:^|\.)([A-Za-z_$][\w$]*)|\[['"]([^'"]+)['"]\]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(trimmed)) !== null) {
    segments.push(match[1] ?? match[2] ?? '');
  }
  return segments.filter(Boolean);
}

function pushTrace(store: FunctionScalpelPageStore, record: FunctionTraceRecord, maxRecords: number): void {
  store.traces.push(record);
  if (store.traces.length > maxRecords) {
    store.traces.splice(0, store.traces.length - maxRecords);
  }
}

function safeSerializeArray(values: unknown[]): unknown[] {
  return values.slice(0, 12).map((value) => safeSerialize(value));
}

function safeSerialize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (depth > 2) {
    return '[MaxDepth]';
  }
  const valueType = typeof value;
  if (valueType === 'string') {
    const text = value as string;
    return text.length > 500 ? `${text.slice(0, 500)}...[truncated]` : text;
  }
  if (valueType === 'number' || valueType === 'boolean' || valueType === 'bigint') {
    return String(value);
  }
  if (valueType === 'function') {
    return `[Function ${(value as { name?: string }).name ?? 'anonymous'}]`;
  }
  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name,
      stack: value.stack?.split('\n').slice(0, 8)
    };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => safeSerialize(item, depth + 1));
  }
  if (valueType === 'object') {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).slice(0, 20)) {
      try {
        output[key] = safeSerialize((value as Record<string, unknown>)[key], depth + 1);
      } catch {
        output[key] = '[Unreadable]';
      }
    }
    return output;
  }
  return String(value);
}

function stackPreview(): string[] {
  return new Error().stack?.split('\n').slice(2, 12).map((line) => line.trim()) ?? [];
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}
