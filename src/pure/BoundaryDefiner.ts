import type { FrozenRuntimeSample, PureBoundary, RuntimeTraceExport } from './types.js';

export class BoundaryDefiner {
  async define(input: {
    frozenSample: FrozenRuntimeSample;
    runtimeTrace?: RuntimeTraceExport | null;
    analyzeTargetSummary?: unknown;
  }): Promise<PureBoundary> {
    const explicitInputs = new Set<string>();
    const derivedInputs = new Set<string>();
    const environmentState = new Set<string>();
    const intermediates = new Set<string>();
    const outputs = new Set<string>();
    const excludedRuntimeNoise = new Set<string>(['timestamp', 'performance.now', 'random', 'screen', 'DOM layout']);

    if (input.frozenSample.requestSample) {
      explicitInputs.add('request.url');
      explicitInputs.add('request.method');
      if (input.frozenSample.requestSample.postData) {
        explicitInputs.add('request.postData');
      }
      const parsed = tryUrl(input.frozenSample.requestSample.url);
      for (const key of parsed?.searchParams.keys() ?? []) {
        if (/sign|token|nonce|vk|tail|clt|gsd?|auth/i.test(key)) {
          intermediates.add(`request.query.${key}`);
        } else {
          derivedInputs.add(`request.query.${key}`);
        }
      }
    }

    environmentState.add('page.url');
    if (input.frozenSample.page.title) {
      environmentState.add('page.title');
    }

    const headers = input.frozenSample.requestSample?.headers ?? {};
    for (const key of Object.keys(headers)) {
      if (/cookie|user-agent|authorization/i.test(key)) {
        environmentState.add(`request.headers.${key}`);
      }
    }

    for (const sample of input.frozenSample.hookSamples) {
      if (sample.target) {
        intermediates.add(`hook.${sample.target}`);
      }
      if (Array.isArray(sample.record.args)) {
        explicitInputs.add(`hook.${sample.hookId}.args`);
      }
    }

    for (const record of input.runtimeTrace?.records ?? []) {
      if (record.kind === 'call') {
        explicitInputs.add(`trace.call.${record.target}`);
      }
      if (record.kind === 'return') {
        outputs.add(`trace.return.${record.target}`);
      }
      if (record.kind === 'intermediate') {
        intermediates.add(`trace.${record.target}`);
      }
      if (record.kind === 'error') {
        excludedRuntimeNoise.add(`trace.error.${record.target}`);
      }
    }

    return {
      createdAt: new Date().toISOString(),
      derivedInputs: Array.from(derivedInputs),
      environmentState: Array.from(environmentState),
      excludedRuntimeNoise: Array.from(excludedRuntimeNoise),
      explicitInputs: Array.from(explicitInputs),
      intermediates: Array.from(intermediates),
      notes: [
        'Boundary is deterministic and intentionally conservative.',
        input.runtimeTrace ? 'Runtime trace was included.' : 'Runtime trace was not available; boundary relies on frozen sample only.'
      ],
      outputs: outputs.size > 0 ? Array.from(outputs) : ['request/target output not observed']
    };
  }
}

function tryUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
