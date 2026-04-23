import { AppError } from '../core/errors.js';
import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';

type PreloadHandle = {
  remove?: () => Promise<void>;
};

type PreloadRecord = {
  scriptId: string;
  createdAt: string;
  script: string;
  handle?: PreloadHandle;
};

export class PreloadScriptRegistry {
  private readonly records = new Map<string, PreloadRecord>();

  constructor(private readonly browserSession: BrowserSessionManager) {}

  async add(script: string): Promise<{ scriptId: string; createdAt: string }> {
    if (!script.trim()) {
      throw new AppError('PRELOAD_SCRIPT_EMPTY', 'Preload script must not be empty.');
    }

    const page = await this.browserSession.getSelectedPage();
    const scriptId = `preload-${Date.now().toString(36)}-${this.records.size + 1}`;
    const createdAt = new Date().toISOString();
    const handle = await page.evaluateOnNewDocument(script) as PreloadHandle;
    this.records.set(scriptId, {
      createdAt,
      handle,
      script,
      scriptId
    });
    return {
      createdAt,
      scriptId
    };
  }

  list(): Array<{ scriptId: string; createdAt: string }> {
    return Array.from(this.records.values()).map((record) => ({
      createdAt: record.createdAt,
      scriptId: record.scriptId
    }));
  }

  async remove(scriptId: string): Promise<boolean> {
    const record = this.records.get(scriptId);
    if (!record) {
      return false;
    }
    if (record.handle?.remove) {
      await record.handle.remove();
    }
    return this.records.delete(scriptId);
  }
}
