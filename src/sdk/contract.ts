import type { RegressionBaseline } from '../regression/types.js';

export function buildSdkContract(input: {
  baseline: RegressionBaseline;
  target: 'node' | 'python' | 'dual';
}): Record<string, unknown> {
  return {
    baselineId: input.baseline.baselineId,
    baselineSource: input.baseline.source,
    explicitInputs: input.baseline.contractSummary?.explicitInputs ?? [],
    fixtureFile: input.baseline.fixtureFile,
    nodeEntryFile: input.baseline.nodeEntryFile,
    outputKeys: input.baseline.contractSummary?.outputs ?? [],
    pythonEntryFile: input.baseline.pythonEntryFile ?? null,
    target: input.target,
    verificationProvenance: {
      expectedNodeOutputPresent: input.baseline.expectedNodeOutput !== undefined,
      expectedPythonOutputPresent: input.baseline.expectedPythonOutput !== undefined
    },
    notes: [
      'Generated from a regression baseline after gate evaluation.',
      'This contract is fixture-bound and should not be widened without a new regression baseline.'
    ]
  };
}
