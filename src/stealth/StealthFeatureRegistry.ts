import { AppError } from '../core/errors.js';

export interface StealthFeatureSummary {
  featureId: string;
  enabledByDefault: boolean;
  description: string;
}

const FEATURES: StealthFeatureSummary[] = [
  {
    description: 'Hide navigator.webdriver through a future-document preload getter.',
    enabledByDefault: true,
    featureId: 'navigator.webdriver'
  },
  {
    description: 'Expose stable navigator.languages values.',
    enabledByDefault: true,
    featureId: 'navigator.languages'
  },
  {
    description: 'Expose a bounded non-empty navigator.plugins-like surface.',
    enabledByDefault: true,
    featureId: 'navigator.plugins'
  },
  {
    description: 'Provide a minimal chrome.runtime placeholder.',
    enabledByDefault: true,
    featureId: 'chrome.runtime'
  },
  {
    description: 'Soften navigator.permissions.query for notification permission checks.',
    enabledByDefault: true,
    featureId: 'permissions.query'
  },
  {
    description: 'Expose stable hardwareConcurrency within a conservative range.',
    enabledByDefault: false,
    featureId: 'hardwareConcurrency'
  },
  {
    description: 'Scrub common webdriver flags from selected document globals.',
    enabledByDefault: true,
    featureId: 'webdriver.flags'
  }
];

export class StealthFeatureRegistry {
  private readonly enabled = new Set(FEATURES.filter((feature) => feature.enabledByDefault).map((feature) => feature.featureId));
  private readonly disabled = new Set<string>();

  listFeatures(): StealthFeatureSummary[] {
    return FEATURES.map((feature) => ({ ...feature }));
  }

  setFeatures(input: {
    enabled?: string[];
    disabled?: string[];
  }): {
    enabled: string[];
    disabled: string[];
  } {
    const known = new Set(FEATURES.map((feature) => feature.featureId));
    for (const featureId of [...(input.enabled ?? []), ...(input.disabled ?? [])]) {
      if (!known.has(featureId)) {
        throw new AppError('STEALTH_FEATURE_NOT_FOUND', `Unknown stealth feature: ${featureId}`, {
          featureId
        });
      }
    }

    for (const featureId of input.enabled ?? []) {
      this.enabled.add(featureId);
      this.disabled.delete(featureId);
    }
    for (const featureId of input.disabled ?? []) {
      this.enabled.delete(featureId);
      this.disabled.add(featureId);
    }

    return this.getState();
  }

  getState(): {
    enabled: string[];
    disabled: string[];
  } {
    return {
      disabled: Array.from(this.disabled).sort(),
      enabled: Array.from(this.enabled).sort()
    };
  }
}

export function buildStealthFeatureScript(enabledFeatures: readonly string[]): string {
  const scripts = enabledFeatures.map((featureId) => FEATURE_SCRIPTS[featureId]).filter(Boolean);
  return `
(() => {
  try {
${scripts.join('\n')}
  } catch (_) {
    // Stealth substrate is best-effort and must not break page execution.
  }
})();
`;
}

export function normalizeLegacyStealthFeatureIds(features: readonly string[]): string[] {
  return Array.from(new Set(features.map((feature) => LEGACY_ALIASES[feature] ?? feature)));
}

const FEATURE_SCRIPTS: Record<string, string> = {
  'chrome.runtime': `
    if (!window.chrome) {
      Object.defineProperty(window, 'chrome', { configurable: true, value: { runtime: {} } });
    } else if (!window.chrome.runtime) {
      Object.defineProperty(window.chrome, 'runtime', { configurable: true, value: {} });
    }
`,
  hardwareConcurrency: `
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      configurable: true,
      get: () => 8
    });
`,
  'navigator.languages': `
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      get: () => ['en-US', 'en']
    });
`,
  'navigator.plugins': `
    Object.defineProperty(navigator, 'plugins', {
      configurable: true,
      get: () => [1, 2, 3, 4, 5]
    });
`,
  'navigator.webdriver': `
    Object.defineProperty(navigator, 'webdriver', {
      configurable: true,
      get: () => undefined
    });
`,
  'permissions.query': `
    if (navigator.permissions && navigator.permissions.query) {
      const originalQuery = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = (parameters) => parameters && parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters);
    }
`,
  'webdriver.flags': `
    for (const key of ['__webdriver_evaluate', '__selenium_evaluate', '__webdriver_script_function', '__webdriver_script_func']) {
      try {
        Object.defineProperty(window, key, { configurable: true, value: undefined });
      } catch (_) {}
    }
`
};

const LEGACY_ALIASES: Record<string, string> = {
  'chrome.runtime placeholder': 'chrome.runtime',
  languages: 'navigator.languages',
  'permissions query soften': 'permissions.query',
  plugins: 'navigator.plugins'
};
