import { AppError } from '../core/errors.js';
import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import type { PreloadScriptRegistry } from './PreloadScriptRegistry.js';
import type { StealthPresetSummary } from './types.js';

const FEATURE_SCRIPTS: Record<string, string> = {
  'chrome.runtime placeholder': `
Object.defineProperty(window, 'chrome', {
  configurable: true,
  value: window.chrome || { runtime: {} }
});
`,
  languages: `
Object.defineProperty(navigator, 'languages', {
  configurable: true,
  get: () => ['en-US', 'en']
});
`,
  'navigator.webdriver': `
Object.defineProperty(navigator, 'webdriver', {
  configurable: true,
  get: () => undefined
});
`,
  plugins: `
Object.defineProperty(navigator, 'plugins', {
  configurable: true,
  get: () => [1, 2, 3, 4, 5]
});
`,
  'permissions query soften': `
if (navigator.permissions && navigator.permissions.query) {
  const originalQuery = navigator.permissions.query.bind(navigator.permissions);
  navigator.permissions.query = (parameters) => parameters && parameters.name === 'notifications'
    ? Promise.resolve({ state: Notification.permission })
    : originalQuery(parameters);
}
`
};

const PRESETS: StealthPresetSummary[] = [
  {
    description: 'Hide navigator.webdriver only. Minimal future-document preload.',
    features: ['navigator.webdriver'],
    presetId: 'webdriver-hide'
  },
  {
    description: 'Soften common navigator surfaces without site-specific anti-detection logic.',
    features: ['navigator.webdriver', 'languages', 'plugins'],
    presetId: 'navigator-soften'
  },
  {
    description: 'Basic headless softening preset for reverse field work.',
    features: ['navigator.webdriver', 'languages', 'plugins', 'chrome.runtime placeholder', 'permissions query soften'],
    presetId: 'basic-headless-soften'
  }
];

export class StealthPresetRegistry {
  private lastPreset: string | null = null;
  private currentUserAgent: string | null = null;

  constructor(
    private readonly deps: {
      browserSession: BrowserSessionManager;
      preloadScriptRegistry: PreloadScriptRegistry;
    }
  ) {}

  listPresets(): StealthPresetSummary[] {
    return PRESETS;
  }

  listFeatures(): string[] {
    return Object.keys(FEATURE_SCRIPTS);
  }

  async applyPreset(options: {
    presetId: string;
  }): Promise<{ presetId: string; appliedFeatures: string[] }> {
    const preset = PRESETS.find((item) => item.presetId === options.presetId);
    if (!preset) {
      throw new AppError('STEALTH_PRESET_NOT_FOUND', `Stealth preset not found: ${options.presetId}`, {
        presetId: options.presetId
      });
    }

    const script = preset.features.map((feature) => FEATURE_SCRIPTS[feature]).filter(Boolean).join('\n');
    await this.deps.preloadScriptRegistry.add(script);

    const page = await this.deps.browserSession.getSelectedPage();
    await page.evaluate((source) => {
      (0, eval)(source);
    }, script).catch(() => undefined);

    this.lastPreset = preset.presetId;
    return {
      appliedFeatures: preset.features,
      presetId: preset.presetId
    };
  }

  async setUserAgent(userAgent: string): Promise<{ userAgent: string }> {
    if (!userAgent.trim()) {
      throw new AppError('USER_AGENT_EMPTY', 'User-Agent must not be empty.');
    }
    const page = await this.deps.browserSession.getSelectedPage();
    await page.setUserAgent(userAgent);
    this.currentUserAgent = userAgent;
    return {
      userAgent
    };
  }

  getLastPreset(): string | null {
    return this.lastPreset;
  }

  getCurrentUserAgent(): string | null {
    return this.currentUserAgent;
  }
}
