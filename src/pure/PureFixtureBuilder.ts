import type { FrozenRuntimeSample, PureBoundary, PureFixture, RuntimeTraceExport } from './types.js';

export class PureFixtureBuilder {
  async build(input: {
    frozenSample: FrozenRuntimeSample;
    boundary: PureBoundary;
    runtimeTrace?: RuntimeTraceExport | null;
  }): Promise<PureFixture> {
    const notes = ['Pure fixture is derived from the frozen runtime sample.'];
    const returnRecord = [...(input.runtimeTrace?.records ?? [])].reverse().find((record) => record.kind === 'return');
    const intermediateRecords = input.runtimeTrace?.records.filter((record) => record.kind === 'intermediate') ?? [];
    const explicitInput = this.pickBoundaryValues(input.boundary.explicitInputs, input.frozenSample, input.runtimeTrace, notes);
    const derived = this.pickBoundaryValues(input.boundary.derivedInputs, input.frozenSample, input.runtimeTrace, notes);
    const environmentState = this.pickBoundaryValues(input.boundary.environmentState, input.frozenSample, input.runtimeTrace, notes);

    if (!returnRecord) {
      notes.push('No runtime return value was observed; expectedOutput is set to null and verification should not be treated as port-ready.');
    }
    notes.push('Pure fixture input is boundary-shaped: raw page/request/hook samples are not passed to computePure input.');

    return {
      boundary: input.boundary,
      context: {
        environmentState
      },
      createdAt: new Date().toISOString(),
      derived,
      evidence: {
        hookSampleCount: input.frozenSample.hookSamples.length,
        pageUrl: input.frozenSample.page.url,
        requestSample: input.frozenSample.requestSample
          ? {
              hasPostData: input.frozenSample.requestSample.postData != null,
              headerKeys: Object.keys(input.frozenSample.requestSample.headers ?? {}),
              method: input.frozenSample.requestSample.method,
              url: input.frozenSample.requestSample.url
            }
          : null,
        traceRecordCount: input.runtimeTrace?.records.length ?? 0
      },
      expectedOutput: returnRecord?.value ?? null,
      input: explicitInput,
      intermediates: Object.fromEntries(intermediateRecords.map((record) => [record.target, record.value])),
      notes,
      source: {
        sampleType: input.frozenSample.source,
        taskId: input.frozenSample.taskId ?? null
      }
    };
  }

  private pickBoundaryValues(
    labels: string[],
    frozenSample: FrozenRuntimeSample,
    runtimeTrace: RuntimeTraceExport | null | undefined,
    notes: string[]
  ): Record<string, unknown> {
    const output: Record<string, unknown> = {};

    for (const label of labels) {
      const value = this.resolveBoundaryValue(label, frozenSample, runtimeTrace);
      if (value === undefined) {
        notes.push(`Boundary label has no concrete fixture value and was omitted: ${label}`);
        continue;
      }
      output[label] = value;
    }

    return output;
  }

  private resolveBoundaryValue(
    label: string,
    frozenSample: FrozenRuntimeSample,
    runtimeTrace: RuntimeTraceExport | null | undefined
  ): unknown {
    const request = frozenSample.requestSample ?? null;

    if (label === 'request.url') {
      return request?.url;
    }
    if (label === 'request.method') {
      return request?.method;
    }
    if (label === 'request.postData') {
      return request?.postData ?? undefined;
    }
    if (label === 'page.url') {
      return frozenSample.page.url;
    }
    if (label === 'page.title') {
      return frozenSample.page.title;
    }

    const headerMatch = /^request\.headers\.(.+)$/.exec(label);
    if (headerMatch?.[1]) {
      return this.pickHeader(request?.headers, headerMatch[1]);
    }

    const queryMatch = /^request\.query\.(.+)$/.exec(label);
    if (queryMatch?.[1] && request?.url) {
      try {
        return new URL(request.url).searchParams.get(queryMatch[1]) ?? undefined;
      } catch {
        return undefined;
      }
    }

    const hookArgsMatch = /^hook\.(.+)\.args$/.exec(label);
    if (hookArgsMatch?.[1]) {
      const sample = frozenSample.hookSamples.find((item) => item.hookId === hookArgsMatch[1]);
      return Array.isArray(sample?.record.args) ? sample.record.args : undefined;
    }

    const traceCallMatch = /^trace\.call\.(.+)$/.exec(label);
    if (traceCallMatch?.[1]) {
      return runtimeTrace?.records.find((record) => record.kind === 'call' && record.target === traceCallMatch[1])?.value;
    }

    const traceReturnMatch = /^trace\.return\.(.+)$/.exec(label);
    if (traceReturnMatch?.[1]) {
      return runtimeTrace?.records.find((record) => record.kind === 'return' && record.target === traceReturnMatch[1])?.value;
    }

    const traceIntermediateMatch = /^trace\.(.+)$/.exec(label);
    if (traceIntermediateMatch?.[1]) {
      return runtimeTrace?.records.find((record) => record.kind === 'intermediate' && record.target === traceIntermediateMatch[1])?.value;
    }

    return undefined;
  }

  private pickHeader(headers: Record<string, string> | undefined, wantedKey: string): string | undefined {
    for (const [key, value] of Object.entries(headers ?? {})) {
      if (key.toLowerCase() === wantedKey.toLowerCase()) {
        return value;
      }
    }
    return undefined;
  }
}
