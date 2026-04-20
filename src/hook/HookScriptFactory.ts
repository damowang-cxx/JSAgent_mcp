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
const dispatchKey = ${JSON.stringify(`function:${targetPath}`)};
subscribeToTarget(dispatchKey, { targetPath });

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

if (resolved.value && resolved.value.__jsagentDispatchKey === dispatchKey) {
  markTargetInstalled(dispatchKey, { targetPath });
  updateHookMeta({ targetPath });
  return;
}

const original = resolved.value && resolved.value.__jsagentOriginal
  ? resolved.value.__jsagentOriginal
  : resolved.value;
const wrapped = function(...args) {
  const startedAt = new Date().toISOString();

  try {
    const result = original.apply(this, args);

    if (result && typeof result.then === 'function') {
      return result.then((resolvedValue) => {
        recordForSubscribers(dispatchKey, {
          targetPath,
          timestamp: startedAt,
          args: safeSerialize(args),
          returnValue: safeSerialize(resolvedValue)
        });
        return resolvedValue;
      }).catch((error) => {
        recordForSubscribers(dispatchKey, {
          error: safeSerialize(error),
          failed: true,
          targetPath,
          timestamp: startedAt,
          args: safeSerialize(args)
        });
        throw error;
      });
    }

    recordForSubscribers(dispatchKey, {
      targetPath,
      timestamp: startedAt,
      args: safeSerialize(args),
      returnValue: safeSerialize(result)
    });
    return result;
  } catch (error) {
    recordForSubscribers(dispatchKey, {
      error: safeSerialize(error),
      failed: true,
      targetPath,
      timestamp: startedAt,
      args: safeSerialize(args)
    });
    throw error;
  }
};

Object.defineProperty(wrapped, '__jsagentDispatchKey', {
  configurable: true,
  enumerable: false,
  value: dispatchKey
});

Object.defineProperty(wrapped, '__jsagentOriginal', {
  configurable: true,
  enumerable: false,
  value: original
});

resolved.parent[resolved.property] = wrapped;
markTargetInstalled(dispatchKey, { targetPath });
`
    );
  }

  private buildFetchHookScript(options: HookCreateOptions & { hookId: string }): string {
    return this.wrapScript(
      options,
      `
const dispatchKey = 'fetch';
subscribeToTarget(dispatchKey, { targetPath: 'window.fetch' });

if (typeof window.fetch !== 'function') {
  updateHookMeta({ lastError: 'window.fetch is not available', targetPath: 'window.fetch' });
  return;
}

if (window.fetch && window.fetch.__jsagentDispatchKey === dispatchKey) {
  markTargetInstalled(dispatchKey, { targetPath: 'window.fetch' });
  return;
}

const originalFetch = window.fetch && window.fetch.__jsagentOriginal
  ? window.fetch.__jsagentOriginal
  : window.fetch;
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
    recordForSubscribers(dispatchKey, {
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
    recordForSubscribers(dispatchKey, {
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

Object.defineProperty(wrappedFetch, '__jsagentDispatchKey', {
  configurable: true,
  enumerable: false,
  value: dispatchKey
});

Object.defineProperty(wrappedFetch, '__jsagentOriginal', {
  configurable: true,
  enumerable: false,
  value: originalFetch
});

window.fetch = wrappedFetch;
markTargetInstalled(dispatchKey, { targetPath: 'window.fetch' });
`
    );
  }

  private buildXhrHookScript(options: HookCreateOptions & { hookId: string }): string {
    return this.wrapScript(
      options,
      `
const dispatchKey = 'xhr';
subscribeToTarget(dispatchKey, { targetPath: 'XMLHttpRequest.prototype' });

const xhrPrototype = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
if (!xhrPrototype || typeof xhrPrototype.open !== 'function' || typeof xhrPrototype.send !== 'function') {
  updateHookMeta({ lastError: 'XMLHttpRequest is not available', targetPath: 'XMLHttpRequest.prototype' });
  return;
}

if (
  xhrPrototype.open &&
  xhrPrototype.send &&
  xhrPrototype.open.__jsagentDispatchKey === dispatchKey &&
  xhrPrototype.send.__jsagentDispatchKey === dispatchKey
) {
  markTargetInstalled(dispatchKey, { targetPath: 'XMLHttpRequest.prototype' });
  return;
}

const originalOpen = xhrPrototype.open && xhrPrototype.open.__jsagentOriginal
  ? xhrPrototype.open.__jsagentOriginal
  : xhrPrototype.open;
const originalSend = xhrPrototype.send && xhrPrototype.send.__jsagentOriginal
  ? xhrPrototype.send.__jsagentOriginal
  : xhrPrototype.send;

xhrPrototype.open = function(method, url, ...rest) {
  this.__jsagentXhrState = {
    method: typeof method === 'string' ? method : String(method),
    startedAt: new Date().toISOString(),
    url: typeof url === 'string' ? url : String(url)
  };

  return originalOpen.call(this, method, url, ...rest);
};

Object.defineProperty(xhrPrototype.open, '__jsagentDispatchKey', {
  configurable: true,
  enumerable: false,
  value: dispatchKey
});

Object.defineProperty(xhrPrototype.open, '__jsagentOriginal', {
  configurable: true,
  enumerable: false,
  value: originalOpen
});

xhrPrototype.send = function(body) {
  const state = this.__jsagentXhrState && typeof this.__jsagentXhrState === 'object'
    ? this.__jsagentXhrState
    : {
        method: 'GET',
        startedAt: new Date().toISOString(),
        url: ''
      };

  const emitRecord = (extra) => {
    recordForSubscribers(dispatchKey, {
      body: safeSerialize(body),
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

Object.defineProperty(xhrPrototype.send, '__jsagentDispatchKey', {
  configurable: true,
  enumerable: false,
  value: dispatchKey
});

Object.defineProperty(xhrPrototype.send, '__jsagentOriginal', {
  configurable: true,
  enumerable: false,
  value: originalSend
});

markTargetInstalled(dispatchKey, { targetPath: 'XMLHttpRequest.prototype' });
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
  if (!root[hooksInstalledKey] || typeof root[hooksInstalledKey] !== 'object') {
    root[hooksInstalledKey] = {};
  }

  const store = root[hookStoreKey];
  const meta = root[hookMetaKey];
  const installed = root[hooksInstalledKey];
  if (!installed.hookIds || typeof installed.hookIds !== 'object') {
    installed.hookIds = {};
  }
  if (!installed.targets || typeof installed.targets !== 'object') {
    installed.targets = {};
  }

  const installedHookIds = installed.hookIds;
  const installedTargets = installed.targets;

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

  function ensureRecordList(recordHookId) {
    if (!Array.isArray(store[recordHookId])) {
      store[recordHookId] = [];
    }
    return store[recordHookId];
  }

  function pushRecord(recordHookId, record) {
    const list = ensureRecordList(recordHookId);
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

  function ensureTargetState(dispatchKey) {
    if (!installedTargets[dispatchKey] || typeof installedTargets[dispatchKey] !== 'object') {
      installedTargets[dispatchKey] = {
        installed: false,
        subscribers: []
      };
    }

    if (!Array.isArray(installedTargets[dispatchKey].subscribers)) {
      installedTargets[dispatchKey].subscribers = [];
    }

    return installedTargets[dispatchKey];
  }

  function getSubscribers(dispatchKey) {
    return ensureTargetState(dispatchKey).subscribers.slice();
  }

  function subscribeToTarget(dispatchKey, extra = {}) {
    const targetState = ensureTargetState(dispatchKey);
    if (!targetState.subscribers.includes(hookId)) {
      targetState.subscribers.push(hookId);
    }

    installedHookIds[hookId] = true;
    updateHookMeta({
      installed: Boolean(targetState.installed),
      installedAt: targetState.installedAt,
      subscriptionKey: dispatchKey,
      ...extra
    });

    return targetState;
  }

  function recordForSubscribers(dispatchKey, record) {
    for (const subscriberHookId of getSubscribers(dispatchKey)) {
      pushRecord(subscriberHookId, {
        hookId: subscriberHookId,
        ...record
      });
    }
  }

  function markTargetInstalled(dispatchKey, extra = {}) {
    const targetState = ensureTargetState(dispatchKey);
    if (!targetState.installedAt) {
      targetState.installedAt = new Date().toISOString();
    }

    targetState.installed = true;
    installedHookIds[hookId] = true;
    updateHookMeta({
      installed: true,
      installedAt: targetState.installedAt,
      subscriptionKey: dispatchKey,
      ...extra
    });
  }

  ${body}
})();
`.trim();
  }
}
