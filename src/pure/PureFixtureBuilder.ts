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

    if (!returnRecord) {
      notes.push('No runtime return value was observed; expectedOutput is set to null and verification should not be treated as port-ready.');
    }

    return {
      boundary: input.boundary,
      createdAt: new Date().toISOString(),
      expectedOutput: returnRecord?.value ?? null,
      input: {
        hookSamples: input.frozenSample.hookSamples.map((sample) => ({
          hookId: sample.hookId,
          target: sample.target,
          args: Array.isArray(sample.record.args) ? sample.record.args : undefined
        })),
        page: input.frozenSample.page,
        request: input.frozenSample.requestSample ?? null
      },
      intermediates: Object.fromEntries(intermediateRecords.map((record) => [record.target, record.value])),
      notes,
      source: {
        sampleType: input.frozenSample.source,
        taskId: input.frozenSample.taskId ?? null
      }
    };
  }
}
