import type { Page } from 'puppeteer';

import { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import { AppError } from '../core/errors.js';
import { HookScriptFactory } from './HookScriptFactory.js';
import type { HookCreateOptions, HookDataResult, HookInjectionOptions, HookManagerStats, HookMeta } from './types.js';

const HOOK_STORE_KEY = 'JSAGENT_HOOK_STORE';

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export class HookManager {
  private readonly hookScriptFactory = new HookScriptFactory();
  private readonly hooks = new Map<string, HookMeta>();
  private readonly injectedTargets = new Map<string, Set<string>>();
  private readonly currentDocumentTargets = new Map<string, Set<string>>();
  private readonly futureDocumentTargets = new Map<string, Set<string>>();

  constructor(private readonly browserSession: BrowserSessionManager) {}

  createHook(options: HookCreateOptions): HookMeta {
    const hookId = options.hookId?.trim() || this.createHookId(options.type);
    if (this.hooks.has(hookId)) {
      throw new AppError('HOOK_CONFLICT', `Hook is already registered: ${hookId}`, { hookId });
    }

    if (options.type === 'function') {
      const targetPath = options.params?.targetPath;
      if (typeof targetPath !== 'string' || targetPath.trim().length === 0) {
        throw new AppError('HOOK_TARGET_REQUIRED', 'Function hooks require params.targetPath.', {
          hookId,
          type: options.type
        });
      }
    }

    this.hookScriptFactory.createScript({
      ...options,
      hookId
    });

    const meta: HookMeta = {
      config: {
        ...options,
        hookId
      },
      createdAt: new Date().toISOString(),
      description: options.description?.trim() || `${options.type} hook`,
      enabled: true,
      hookId,
      injectedTargets: 0,
      type: options.type
    };

    this.hooks.set(hookId, meta);
    this.injectedTargets.set(hookId, new Set());
    this.currentDocumentTargets.set(hookId, new Set());
    this.futureDocumentTargets.set(hookId, new Set());

    return meta;
  }

  listHooks(): HookMeta[] {
    return Array.from(this.hooks.values()).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  getHook(hookId: string): HookMeta | undefined {
    return this.hooks.get(hookId);
  }

  async injectHook(
    hookId: string,
    page: Page,
    options: HookInjectionOptions = {}
  ): Promise<{ hookId: string; pageUrl: string }> {
    const meta = this.getHook(hookId);
    if (!meta) {
      throw new AppError('HOOK_NOT_FOUND', `Hook not found: ${hookId}`, { hookId });
    }

    const currentDocument = options.currentDocument ?? true;
    const futureDocuments = options.futureDocuments ?? true;
    if (!currentDocument && !futureDocuments) {
      throw new AppError('HOOK_INJECTION_TARGET_REQUIRED', 'At least one of currentDocument or futureDocuments must be true.', {
        hookId
      });
    }

    const pageId = this.browserSession.getPageId(page);
    const currentTargets = this.getTargetSet(this.currentDocumentTargets, hookId);
    const futureTargets = this.getTargetSet(this.futureDocumentTargets, hookId);
    const shouldInjectCurrentDocument = currentDocument && !currentTargets.has(pageId);
    const shouldInjectFutureDocuments = futureDocuments && !futureTargets.has(pageId);

    if (!shouldInjectCurrentDocument && !shouldInjectFutureDocuments) {
      return {
        hookId,
        pageUrl: page.url()
      };
    }

    const script = this.hookScriptFactory.createScript({
      ...meta.config,
      hookId: meta.hookId
    });

    try {
      if (shouldInjectFutureDocuments) {
        await page.evaluateOnNewDocument(script);
        futureTargets.add(pageId);
      }

      if (shouldInjectCurrentDocument) {
        await page.evaluate((source) => {
          (0, eval)(source);
        }, script);
        currentTargets.add(pageId);
      }
    } catch (error) {
      throw new AppError('HOOK_INJECTION_FAILED', `Failed to inject hook: ${toErrorMessage(error)}`, {
        currentDocument: shouldInjectCurrentDocument,
        futureDocuments: shouldInjectFutureDocuments,
        hookId
      });
    }

    const injectedTargets = this.getTargetSet(this.injectedTargets, hookId);
    for (const targetPageId of currentTargets) {
      injectedTargets.add(targetPageId);
    }
    for (const targetPageId of futureTargets) {
      injectedTargets.add(targetPageId);
    }

    meta.injectedTargets = injectedTargets.size;

    return {
      hookId,
      pageUrl: page.url()
    };
  }

  async getHookData(page: Page, hookId?: string): Promise<HookDataResult> {
    const records = await page.evaluate(({ hookId: targetHookId, storeKey }) => {
      const root = window as unknown as Window & {
        [key: string]: unknown;
      };
      const store = (root[storeKey] ?? {}) as Record<string, unknown>;
      const normalized: Record<string, Array<Record<string, unknown>>> = {};

      if (typeof targetHookId === 'string') {
        const value = store[targetHookId];
        normalized[targetHookId] = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
        return normalized;
      }

      for (const [currentHookId, value] of Object.entries(store)) {
        normalized[currentHookId] = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
      }

      return normalized;
    }, {
      hookId,
      storeKey: HOOK_STORE_KEY
    });

    return {
      ...(hookId ? { hookId } : {}),
      records,
      totalHooks: Object.keys(records).length
    };
  }

  async clearHookData(page: Page, hookId?: string): Promise<{ clearedCount: number }> {
    return page.evaluate(({ hookId: targetHookId, storeKey }) => {
      const root = window as unknown as Window & {
        [key: string]: unknown;
      };
      const store = (root[storeKey] ?? {}) as Record<string, unknown>;

      if (typeof targetHookId === 'string') {
        const current = store[targetHookId];
        const clearedCount = Array.isArray(current) ? current.length : 0;
        store[targetHookId] = [];
        root[storeKey] = store;
        return { clearedCount };
      }

      let clearedCount = 0;
      for (const key of Object.keys(store)) {
        const current = store[key];
        clearedCount += Array.isArray(current) ? current.length : 0;
        store[key] = [];
      }
      root[storeKey] = store;
      return { clearedCount };
    }, {
      hookId,
      storeKey: HOOK_STORE_KEY
    });
  }

  removeHook(hookId: string): boolean {
    this.injectedTargets.delete(hookId);
    this.currentDocumentTargets.delete(hookId);
    this.futureDocumentTargets.delete(hookId);
    return this.hooks.delete(hookId);
  }

  getStats(): HookManagerStats {
    const hooks = this.listHooks();
    const enabledHooks = hooks.filter((hook) => hook.enabled).length;

    return {
      disabledHooks: hooks.length - enabledHooks,
      enabledHooks,
      totalHooks: hooks.length
    };
  }

  private createHookId(type: HookCreateOptions['type']): string {
    return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private getTargetSet(targets: Map<string, Set<string>>, hookId: string): Set<string> {
    const existing = targets.get(hookId);
    if (existing) {
      return existing;
    }

    const created = new Set<string>();
    targets.set(hookId, created);
    return created;
  }
}
