export class EnvAccessLogger {
  buildShimCode(): string {
    return `
const root = globalThis;
if (!Array.isArray(root.__JSAGENT_ENV_ACCESS__)) {
  root.__JSAGENT_ENV_ACCESS__ = [];
}

function logEnvAccess(type, path, detail = {}) {
  root.__JSAGENT_ENV_ACCESS__.push({
    type,
    path,
    timestamp: new Date().toISOString(),
    ...detail
  });
}

function createCallableProxy(path) {
  const target = function() {};
  return new Proxy(target, {
    apply(_target, _thisArg, args) {
      logEnvAccess('function-call', path, { argsLength: args.length });
      return undefined;
    },
    construct(_target, args) {
      logEnvAccess('constructor-call', path, { argsLength: args.length });
      return {};
    },
    get(_target, prop) {
      if (prop === Symbol.toPrimitive) return () => '';
      if (prop === 'toString') return () => '[JSAgentEnvProxy]';
      const childPath = path + '.' + String(prop);
      logEnvAccess('missing-property', childPath);
      return createCallableProxy(childPath);
    }
  });
}

function ensureObject(name, seed = {}) {
  if (root[name] === undefined || root[name] === null) {
    logEnvAccess('missing-global', name);
    setGlobal(name, seed);
  }
  if (typeof root[name] !== 'object' && typeof root[name] !== 'function') {
    return;
  }
  setGlobal(name, new Proxy(root[name], {
    get(target, prop, receiver) {
      if (prop in target) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value === 'function') {
          return function(...args) {
            logEnvAccess('function-call', name + '.' + String(prop), { argsLength: args.length });
            return value.apply(this, args);
          };
        }
        return value;
      }
      const childPath = name + '.' + String(prop);
      logEnvAccess('missing-property', childPath);
      return createCallableProxy(childPath);
    }
  }));
}

function setGlobal(name, value) {
  try {
    root[name] = value;
    return;
  } catch {
    // Node exposes some browser-like globals through getter-only properties.
    // Redefine only the named global needed by this rebuild probe.
  }

  try {
    Object.defineProperty(root, name, {
      configurable: true,
      enumerable: true,
      value,
      writable: true
    });
  } catch {
    logEnvAccess('missing-property', name, { message: 'Unable to install env access proxy' });
  }
}

ensureObject('window', root);
ensureObject('self', root);
ensureObject('document', { cookie: '', location: root.location ?? { href: '' } });
ensureObject('navigator', { userAgent: 'JSAgent_mcp rebuild' });
ensureObject('location', { href: '' });
ensureObject('localStorage', createStorageShim('localStorage'));
ensureObject('sessionStorage', createStorageShim('sessionStorage'));
ensureObject('crypto', {});
ensureObject('performance', { now: () => Date.now() });
ensureObject('screen', {});

if (typeof root.atob !== 'function') {
  root.atob = (value) => Buffer.from(String(value), 'base64').toString('utf8');
}
if (typeof root.btoa !== 'function') {
  root.btoa = (value) => Buffer.from(String(value), 'utf8').toString('base64');
}

function createStorageShim(name) {
  const store = new Map();
  return {
    getItem(key) {
      logEnvAccess('function-call', name + '.getItem', { argsLength: 1 });
      return store.has(String(key)) ? store.get(String(key)) : null;
    },
    setItem(key, value) {
      logEnvAccess('function-call', name + '.setItem', { argsLength: 2 });
      store.set(String(key), String(value));
    },
    removeItem(key) {
      logEnvAccess('function-call', name + '.removeItem', { argsLength: 1 });
      store.delete(String(key));
    },
    clear() {
      logEnvAccess('function-call', name + '.clear', { argsLength: 0 });
      store.clear();
    }
  };
}
`.trim();
  }

  summarize(logs: unknown[]): { total: number; byType: Record<string, number> } {
    const byType: Record<string, number> = {};

    for (const item of logs) {
      const type =
        item && typeof item === 'object' && 'type' in item && typeof (item as { type?: unknown }).type === 'string'
          ? (item as { type: string }).type
          : 'unknown';
      byType[type] = (byType[type] ?? 0) + 1;
    }

    return {
      byType,
      total: logs.length
    };
  }
}
