import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import type { StorageEntry, StorageSnapshot } from './types.js';

type StorageType = 'cookies' | 'localStorage' | 'sessionStorage' | 'all';

export class StorageInspector {
  constructor(private readonly browserSession: BrowserSessionManager) {}

  async get(options: {
    type?: StorageType;
    filter?: string;
  } = {}): Promise<StorageSnapshot> {
    const page = await this.browserSession.getSelectedPage();
    const type = options.type ?? 'all';
    const filter = options.filter?.toLowerCase();
    const snapshot: StorageSnapshot = {};

    if (type === 'cookies' || type === 'all') {
      const cookies = await page.cookies();
      snapshot.cookies = cookies
        .filter((cookie) => matchesFilter(cookie.name, filter) || matchesFilter(cookie.domain, filter))
        .map((cookie) => ({
          domain: cookie.domain,
          expires: cookie.expires === -1 ? null : cookie.expires,
          httpOnly: cookie.httpOnly,
          name: cookie.name,
          path: cookie.path,
          secure: cookie.secure,
          value: cookie.value
        }));
    }

    if (type === 'localStorage' || type === 'all') {
      snapshot.localStorage = await this.readStorage('localStorage', filter);
    }

    if (type === 'sessionStorage' || type === 'all') {
      snapshot.sessionStorage = await this.readStorage('sessionStorage', filter);
    }

    return snapshot;
  }

  private async readStorage(kind: 'localStorage' | 'sessionStorage', filter: string | undefined): Promise<StorageEntry[]> {
    const page = await this.browserSession.getSelectedPage();
    try {
      return await page.evaluate(
        ({ filter, kind }) => {
          const storage = kind === 'localStorage' ? window.localStorage : window.sessionStorage;
          return Array.from({ length: storage.length }, (_, index) => {
            const key = storage.key(index) ?? '';
            return {
              key,
              value: storage.getItem(key) ?? ''
            };
          }).filter((entry) => {
            if (!filter) {
              return true;
            }
            return entry.key.toLowerCase().includes(filter) || entry.value.toLowerCase().includes(filter);
          });
        },
        {
          filter,
          kind
        }
      );
    } catch {
      return [];
    }
  }
}

function matchesFilter(value: string | undefined, filter: string | undefined): boolean {
  return !filter || (value ?? '').toLowerCase().includes(filter);
}
