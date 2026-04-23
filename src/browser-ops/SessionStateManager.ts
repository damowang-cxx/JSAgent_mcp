import { readFile } from 'node:fs/promises';

import { AppError } from '../core/errors.js';
import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import type { SavedSessionState, StorageEntry } from './types.js';
import type { StorageInspector } from './StorageInspector.js';

export class SessionStateManager {
  private readonly states = new Map<string, SavedSessionState>();

  constructor(
    private readonly deps: {
      browserSession: BrowserSessionManager;
      storageInspector: StorageInspector;
    }
  ) {}

  async save(options: {
    sessionId: string;
    includeCookies?: boolean;
    includeLocalStorage?: boolean;
    includeSessionStorage?: boolean;
  }): Promise<SavedSessionState> {
    assertSessionId(options.sessionId);
    const page = await this.deps.browserSession.getSelectedPage();
    const snapshot = await this.deps.storageInspector.get({ type: 'all' });
    const state: SavedSessionState = {
      createdAt: new Date().toISOString(),
      ...(options.includeCookies === false ? {} : { cookies: snapshot.cookies ?? [] }),
      ...(options.includeLocalStorage === false ? {} : { localStorage: snapshot.localStorage ?? [] }),
      ...(options.includeSessionStorage === false ? {} : { sessionStorage: snapshot.sessionStorage ?? [] }),
      sessionId: options.sessionId,
      url: page.url()
    };
    this.states.set(options.sessionId, state);
    return state;
  }

  async restore(options: {
    sessionId: string;
    navigateToSavedUrl?: boolean;
    clearStorageBeforeRestore?: boolean;
  }): Promise<{ restored: boolean; sessionId: string }> {
    const state = this.getRequired(options.sessionId);
    const page = await this.deps.browserSession.getSelectedPage();

    if (state.cookies?.length) {
      await page.setCookie(...state.cookies.map((cookie) => ({
        domain: cookie.domain,
        ...(cookie.expires === null || cookie.expires === undefined ? {} : { expires: cookie.expires }),
        httpOnly: cookie.httpOnly,
        name: cookie.name,
        path: cookie.path,
        secure: cookie.secure,
        value: cookie.value
      })));
    }

    if (options.navigateToSavedUrl && state.url) {
      await page.goto(state.url, {
        waitUntil: 'domcontentloaded'
      });
    }

    await page.evaluate(
      ({ clearStorageBeforeRestore, localStorageEntries, sessionStorageEntries }) => {
        if (clearStorageBeforeRestore) {
          window.localStorage.clear();
          window.sessionStorage.clear();
        }

        for (const entry of localStorageEntries) {
          window.localStorage.setItem(entry.key, entry.value);
        }

        for (const entry of sessionStorageEntries) {
          window.sessionStorage.setItem(entry.key, entry.value);
        }
      },
      {
        clearStorageBeforeRestore: options.clearStorageBeforeRestore ?? false,
        localStorageEntries: state.localStorage ?? [],
        sessionStorageEntries: state.sessionStorage ?? []
      }
    ).catch(() => undefined);

    return {
      restored: true,
      sessionId: options.sessionId
    };
  }

  async dump(options: {
    sessionId: string;
    pretty?: boolean;
  }): Promise<{ sessionId: string; snapshotJson: string }> {
    const state = this.getRequired(options.sessionId);
    return {
      sessionId: options.sessionId,
      snapshotJson: JSON.stringify(state, null, options.pretty ? 2 : 0)
    };
  }

  async load(options: {
    sessionId: string;
    snapshotJson?: string;
    path?: string;
    overwrite?: boolean;
  }): Promise<SavedSessionState> {
    assertSessionId(options.sessionId);
    if (!options.snapshotJson && !options.path) {
      throw new AppError('SESSION_STATE_SOURCE_REQUIRED', 'load_session_state requires snapshotJson or path.');
    }
    if (!options.overwrite && this.states.has(options.sessionId)) {
      throw new AppError('SESSION_STATE_EXISTS', `Session state already exists: ${options.sessionId}`, {
        sessionId: options.sessionId
      });
    }

    const raw = options.snapshotJson ?? await readFile(options.path as string, 'utf8');
    const parsed = JSON.parse(raw) as Partial<SavedSessionState>;
    const state: SavedSessionState = {
      createdAt: parsed.createdAt ?? new Date().toISOString(),
      cookies: parsed.cookies ?? [],
      localStorage: parsed.localStorage ?? [],
      sessionId: options.sessionId,
      sessionStorage: parsed.sessionStorage ?? [],
      url: parsed.url
    };
    this.states.set(options.sessionId, state);
    return state;
  }

  list(): Array<{ sessionId: string; createdAt: string; url?: string }> {
    return Array.from(this.states.values()).map((state) => ({
      createdAt: state.createdAt,
      sessionId: state.sessionId,
      ...(state.url ? { url: state.url } : {})
    }));
  }

  get(sessionId: string): SavedSessionState | null {
    return this.states.get(sessionId) ?? null;
  }

  delete(sessionId: string): boolean {
    return this.states.delete(sessionId);
  }

  private getRequired(sessionId: string): SavedSessionState {
    const state = this.states.get(sessionId);
    if (!state) {
      throw new AppError('SESSION_STATE_NOT_FOUND', `Session state not found: ${sessionId}`, {
        sessionId
      });
    }
    return state;
  }
}

function assertSessionId(sessionId: string): void {
  if (!sessionId || sessionId.includes('/') || sessionId.includes('\\') || sessionId.includes('..')) {
    throw new AppError('INVALID_SESSION_ID', `Invalid sessionId: ${sessionId}`, {
      sessionId
    });
  }
}
