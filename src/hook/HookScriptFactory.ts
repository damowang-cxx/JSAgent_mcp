import { AppError } from '../core/errors.js';
import type { HookCreateOptions, HookType } from './types.js';

const HOOK_STORE_KEY = 'JSAGENT_HOOK_STORE';
const HOOK_META_KEY = 'JSAGENT_HOOK_META';
const HOOKS_INSTALLED_KEY = 'JSAGENT_HOOKS_INSTALLED';
const MAX_RECORDS_PER_HOOK = 500;

export class HookScriptFactory {
  createScript(options: HookCreateOptions & { hookId: string }): string {
    switch (options.type) {
      case 'function':
        return this.buildFunctionHookScript(options);
      case 'fetch':
        return this.buildFetchHookScript(options);
      case 'xhr':
        return this.buildXhrHookScript(options);
      default:
        throw new AppError('HOOK_TYPE_UNSUPPORTED', `Unsupported hook type: ${String((options as { type?: unknown }).type)}`);
    }
  }

  private buildFunctionHookScript(options: HookCreateOptions & { hookId: string }): string {
    const targetPath = options.params?.targetPath;
    if (typeof targetPath !== 'string' || targetPath.trim().length === 0) {
      throw new AppError('HOOK_TARGET_REQUIRED', 'Function hooks require params.targetPath.');
    }

    return this.wrapScript(
      options,
      `
const targetPath = ${JSON.stringify(targetPath)};

function resolveTarget(path) {
  const segments = path.split('.').filter(Boolean);
  let scope = window;

  if (segments[0] === 'window') {
    segments.shift();
  }

  if (segments.length === 0) {
    return null;
  }

  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index];
    if (!scope || !(key in scope)) {
      return null;
    }
    scope = scope[key];
  }

  const property = segments[segments.length - 1];
  if (!scope || !(property in scope)) {
    return null;
  }

  return {
    parent: scope,
    property,
    value: scope[property]
  };
}

const resolved = resolveTarget(targetPath);
if (!resolved || typeof resolved.value !== 'function') {
  updateHookMeta({ lastError: 'Target not found or not callable', targetPath });
  return;
}

const original = resolved.value;
if (original && original.__jsagentHookWrapped === hookId) {
  markInstalled();
  updateHookMeta({ targetPath });
  return;
}

const wrapped = function(...args) {
  const startedAt = new Date().toISOString();

  try {
    const result = original.apply(this, args);

    if (result && typeof result.then === 'function') {
      return result.then((resolvedValue) => {
        pushRecord({
          hookId,
          targetPath,
          timestamp: startedAt,
          args: safeSerialize(args),
          returnValue: safeSerialize(resolvedValue)
        });
        return resolvedValue;
      }).catch((error) => {
        pushRecord({
          error: safeSerialize(error),
          failed: true,
          hookId,
          targetPath,
          timestamp: startedAt,
          args: safeSerialize(args)
        });
        throw error;
      });
    }

    pushRecord({
      hookId,
      targetPath,
      timestamp: startedAt,
      args: safeSerialize(args),
      returnValue: safeSerialize(result)
    });
    return result;
  } catch (error) {
    pushRecord({
      error: safeSerialize(error),
      failed: true,
      hookId,
      targetPath,
      timestamp: startedAt,
      args: safeSerialize(args)
    });
    throw error;
  }
};

Object.defineProperty(wrapped, '__jsagentHookWrapped', {
  configurable: true,
  enumerable: false,
  value: hookId
});

resolved.parent[resolved.property] = wrapped;
markInstalled();
updateHookMeta({ targetPath });
`
    );
  }

  private buildFetchHookScript(options: HookCreateOptions & { hookId: string }): string {
    return this.wrapScript(
      options,
      `
if (typeof window.fetch !== 'function') {
  updateHookMeta({ lastError: 'window.fetch is not available', targetPath: 'window.fetch' });
  return;
}

const originalFetch = window.fetch;
if (originalFetch && originalFetch.__jsagentHookWrapped === hookId) {
  markInstalled();
  updateHookMeta({ targetPath: 'window.fetch' });
  return;
}

const wrappedFetch = async function(...args) {
  const startedAt = new Date().toISOString();
  const requestInput = args[0];
  const requestInit = args[1];
  const url = typeof requestInput === 'string'
    ? requestInput
    : requestInput && typeof requestInput.url === 'string'
      ? requestInput.url
      : String(requestInput);
  const method = requestInit && typeof requestInit.method === 'string'
    ? requestInit.method
    : requestInput && typeof requestInput.method === 'string'
      ? requestInput.method
      : 'GET';

  try {
    const response = await originalFetch.apply(this, args);
    pushRecord({
      hookId,
      timestamp: startedAt,
      type: 'fetch',
      url,
      method,
      input: safeSerialize(requestInput),
      init: safeSerialize(requestInit),
      status: response.status,
      ok: response.ok
    });
    return response;
  } catch (error) {
    pushRecord({
      hookId,
      timestamp: startedAt,
      type: 'fetch',
      url,
      method,
      input: safeSerialize(requestInput),
      init: safeSerialize(requestInit),
      failed: true,
      error: safeSerialize(error)
    });
    throw error;
  }
};

Object.defineProperty(wrappedFetch, '__jsagentHookWrapped', {
  configurable: true,
  enumerable: false,
  value: hookId
});

window.fetch = wrappedFetch;
markInstalled();
updateHookMeta({ targetPath: 'window.fetch' });
`
    );
  }

  private buildXhrHookScript(options: HookCreateOptions & { hookId: string }): string {
    return this.wrapScript(
      options,
      `
const xhrPrototype = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
if (!xhrPrototype || typeof xhrPrototype.open !== 'function' || typeof xhrPrototype.send !== 'function') {
  updateHookMeta({ lastError: 'XMLHttpRequest is not available', targetPath: 'XMLHttpRequest.prototype' });
  return;
}

if (xhrPrototype.open && xhrPrototype.open.__jsagentHookWrapped === hookId) {
  markInstalled();
  updateHookMeta({ targetPath: 'XMLHttpRequest.prototype' });
  return;
}

const originalOpen = xhrPrototype.open;
const originalSend = xhrPrototype.send;

xhrPrototype.open = function(method, url, ...rest) {
  this.__jsagentXhrState = this.__jsagentXhrState || {};
  this.__jsagentXhrState[hookId] = {
    method: typeof method === 'string' ? method : String(method),
    startedAt: new Date().toISOString(),
    url: typeof url === 'string' ? url : String(url)
  };

  return originalOpen.call(this, method, url, ...rest);
};

Object.defineProperty(xhrPrototype.open, '__jsagentHookWrapped', {
  configurable: true,
  enumerable: false,
  value: hookId
});

xhrPrototype.send = function(body) {
  this.__jsagentXhrState = this.__jsagentXhrState || {};
  const state = this.__jsagentXhrState[hookId] || {
    method: 'GET',
    startedAt: new Date().toISOString(),
    url: ''
  };

  const emitRecord = (extra) => {
    pushRecord({
      body: safeSerialize(body),
      hookId,
      method: state.method,
      readyState: this.readyState,
      status: Number(this.status) || 0,
      timestamp: state.startedAt,
      type: 'xhr',
      url: state.url,
      ...extra
    });
  };

  this.addEventListener('loadend', () => {
    emitRecord({
      ok: Number(this.status) >= 200 && Number(this.status) < 400
    });
  }, { once: true });

  this.addEventListener('error', () => {
    emitRecord({
      failed: true,
      failureText: 'error'
    });
  }, { once: true });

  this.addEventListener('abort', () => {
    emitRecord({
      failed: true,
      failureText: 'abort'
    });
  }, { once: true });

  return originalSend.call(this, body);
};

Object.defineProperty(xhrPrototype.send, '__jsagentHookWrapped', {
  configurable: true,
  enumerable: false,
  value: hookId
});

markInstalled();
updateHookMeta({ targetPath: 'XMLHttpRequest.prototype' });
`
    );
  }

  private wrapScript(options: HookCreateOptions & { hookId: string }, body: string): string {
    const description = options.description ?? `${options.type} hook`;

    return `
(() => {
  const hookId = ${JSON.stringify(options.hookId)};
  const hookType = ${JSON.stringify(options.type)};
  const description = ${JSON.stringify(description)};
  const hookStoreKey = ${JSON.stringify(HOOK_STORE_KEY)};
  const hookMetaKey = ${JSON.stringify(HOOK_META_KEY)};
  const hooksInstalledKey = ${JSON.stringify(HOOKS_INSTALLED_KEY)};
  const maxRecords = ${MAX_RECORDS_PER_HOOK};

  const root = window;
  if (!root[hookStoreKey]) {
    root[hookStoreKey] = {};
  }
  if (!root[hookMetaKey]) {
    root[hookMetaKey] = {};
  }
  if (!root[hooksInstalledKey]) {
    root[hooksInstalledKey] = {};
  }

  const store = root[hookStoreKey];
  const meta = root[hookMetaKey];
  const installed = root[hooksInstalledKey];

  function safeSerialize(value, depth = 0) {
    if (value === null || value === undefined) {
      return value;
    }

    if (depth > 2) {
      return '[MaxDepth]';
    }

    const valueType = typeof value;
    if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
      return value;
    }

    if (valueType === 'function') {
      return '[Function]';
    }

    if (value instanceof Error) {
      return {
        message: value.message,
        name: value.name,
        stack: value.stack
      };
    }

    if (Array.isArray(value)) {
      return value.slice(0, 20).map((item) => safeSerialize(item, depth + 1));
    }

    if (typeof URL !== 'undefined' && value instanceof URL) {
      return value.toString();
    }

    if (typeof Request !== 'undefined' && value instanceof Request) {
      return {
        method: value.method,
        url: value.url
      };
    }

    if (typeof Headers !== 'undefined' && value instanceof Headers) {
      const headers = {};
      value.forEach((headerValue, headerName) => {
        headers[headerName] = headerValue;
      });
      return headers;
    }

    if (valueType === 'object') {
      const output = {};
      const entries = Object.entries(value).slice(0, 20);
      for (const [key, entryValue] of entries) {
        output[key] = safeSerialize(entryValue, depth + 1);
      }
      return output;
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return String(value);
    }
  }

  function ensureRecordList() {
    if (!Array.isArray(store[hookId])) {
      store[hookId] = [];
    }
    return store[hookId];
  }

  function pushRecord(record) {
    const list = ensureRecordList();
    list.push(record);
    if (list.length > maxRecords) {
      list.splice(0, list.length - maxRecords);
    }
  }

  function updateHookMeta(extra = {}) {
    meta[hookId] = {
      createdAt: meta[hookId] && meta[hookId].createdAt ? meta[hookId].createdAt : new Date().toISOString(),
      description,
      enabled: true,
      hookId,
      type: hookType,
      updatedAt: new Date().toISOString(),
      ...meta[hookId],
      ...extra
    };
  }

  function markInstalled() {
    installed[hookId] = true;
    updateHookMeta({ installed: true, installedAt: new Date().toISOString() });
  }

  if (installed[hookId]) {
    updateHookMeta();
    return;
  }

  ${body}
})();
`.trim();
  }
}
