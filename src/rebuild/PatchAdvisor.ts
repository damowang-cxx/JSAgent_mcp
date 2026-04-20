import type {
  DivergenceRecord,
  PatchSuggestion,
  RebuildRunResult,
  RuntimeFixture
} from './types.js';

export class PatchAdvisor {
  async suggest(input: {
    divergence: DivergenceRecord | null | undefined;
    runResult: RebuildRunResult;
    fixture?: RuntimeFixture;
  }): Promise<{
    suggestions: PatchSuggestion[];
    firstSuggestion?: PatchSuggestion | null;
  }> {
    const suggestion = this.suggestFirst(input.divergence, input.runResult, input.fixture);
    const suggestions = suggestion ? [suggestion] : [];
    return {
      firstSuggestion: suggestion,
      suggestions
    };
  }

  private suggestFirst(
    divergence: DivergenceRecord | null | undefined,
    runResult: RebuildRunResult,
    fixture?: RuntimeFixture
  ): PatchSuggestion | null {
    if (!divergence) {
      const envMiss = this.firstEnvMissing(runResult);
      if (envMiss) {
        return this.valueSeed(envMiss.path, `Env access log observed missing ${envMiss.path}.`, [`env-access:${envMiss.path}`]);
      }
      return null;
    }

    if (divergence.kind === 'no-output') {
      return {
        basedOn: ['first-divergence:no-output'],
        confidence: 0.7,
        patchType: 'defer-and-observe',
        reason: 'The rebuild entry did not emit structured output, so verify entry selection and fixture before adding environment shims.',
        target: 'entry.js'
      };
    }

    if (divergence.kind === 'missing-global') {
      return this.shimGlobal(divergence.path, divergence);
    }

    if (divergence.kind === 'missing-property') {
      return this.shimProperty(divergence.path, divergence, fixture);
    }

    if (divergence.kind === 'type-mismatch') {
      return {
        basedOn: [`first-divergence:${divergence.kind}:${divergence.path}`],
        confidence: 0.68,
        patchType: 'shim',
        reason: divergence.message,
        suggestedCode: `// Minimal callable shim for first divergence\nglobalThis.${divergence.path} = function(...args) {\n  globalThis.__JSAGENT_ENV_ACCESS__?.push({ type: 'function-call', path: ${JSON.stringify(divergence.path)}, argsLength: args.length, timestamp: new Date().toISOString() });\n  return undefined;\n};`,
        target: divergence.path
      };
    }

    return {
      basedOn: [`first-divergence:${divergence.kind}:${divergence.path}`],
      confidence: 0.55,
      patchType: 'defer-and-observe',
      reason: 'The first divergence is not a simple environment absence; collect one more runtime sample before patching.',
      target: divergence.path
    };
  }

  private shimGlobal(path: string, divergence: DivergenceRecord): PatchSuggestion {
    const snippets: Record<string, string> = {
      TextDecoder: `globalThis.TextDecoder ??= (await import('node:util')).TextDecoder;`,
      TextEncoder: `globalThis.TextEncoder ??= (await import('node:util')).TextEncoder;`,
      atob: `globalThis.atob ??= (value) => Buffer.from(String(value), 'base64').toString('utf8');`,
      btoa: `globalThis.btoa ??= (value) => Buffer.from(String(value), 'utf8').toString('base64');`,
      crypto: `globalThis.crypto ??= { subtle: {} };`,
      document: `globalThis.document ??= { cookie: '', location: globalThis.location ?? { href: '' } };`,
      localStorage: `globalThis.localStorage ??= createStorageShim();`,
      location: `globalThis.location ??= { href: '' };`,
      navigator: `globalThis.navigator ??= { userAgent: 'JSAgent_mcp rebuild' };`,
      performance: `globalThis.performance ??= { now: () => Date.now() };`,
      sessionStorage: `globalThis.sessionStorage ??= createStorageShim();`,
      window: `globalThis.window ??= globalThis;`
    };

    return {
      basedOn: [`first-divergence:${divergence.kind}:${path}`],
      confidence: snippets[path] ? 0.82 : 0.62,
      patchType: path === 'TextEncoder' || path === 'TextDecoder' || path === 'atob' || path === 'btoa' ? 'polyfill' : 'shim',
      reason: divergence.message,
      suggestedCode: snippets[path] ?? `globalThis.${path} ??= {};`,
      target: path
    };
  }

  private shimProperty(path: string, divergence: DivergenceRecord, fixture?: RuntimeFixture): PatchSuggestion {
    const property = path.includes('.') ? path : `globalThis.${path}`;
    const codeByPath: Record<string, string> = {
      'crypto.subtle': `globalThis.crypto ??= {};\nglobalThis.crypto.subtle ??= {};`,
      'document.cookie': `globalThis.document ??= {};\nglobalThis.document.cookie = ${JSON.stringify(this.cookieFromFixture(fixture))};`,
      'location.href': `globalThis.location ??= {};\nglobalThis.location.href = ${JSON.stringify(fixture?.page.url ?? '')};`,
      'navigator.userAgent': `globalThis.navigator ??= {};\nglobalThis.navigator.userAgent = 'JSAgent_mcp rebuild';`
    };

    return {
      basedOn: [`first-divergence:${divergence.kind}:${path}`],
      confidence: codeByPath[path] ? 0.8 : 0.6,
      patchType: codeByPath[path] ? 'value-seed' : 'shim',
      reason: divergence.message,
      suggestedCode: codeByPath[path] ?? `${property} ??= {};`,
      target: path
    };
  }

  private valueSeed(path: string, reason: string, basedOn: string[]): PatchSuggestion {
    return {
      basedOn,
      confidence: 0.58,
      patchType: 'value-seed',
      reason,
      suggestedCode: `// Seed only the first observed missing path.\nglobalThis.${path} ??= {};`,
      target: path
    };
  }

  private firstEnvMissing(runResult: RebuildRunResult): { path: string } | null {
    const logs = runResult.envAccessLog ?? [];
    const match = logs.find((item): item is { path: string } => {
      if (!item || typeof item !== 'object') {
        return false;
      }
      const record = item as Record<string, unknown>;
      return typeof record.path === 'string' && (record.type === 'missing-global' || record.type === 'missing-property');
    });
    return match ? { path: match.path } : null;
  }

  private cookieFromFixture(fixture?: RuntimeFixture): string {
    return fixture?.requestSamples
      .flatMap((request) => Object.entries(request.headers ?? {}))
      .filter(([key]) => key.toLowerCase() === 'cookie')
      .map(([, value]) => value)
      .join('; ') ?? '';
  }
}
