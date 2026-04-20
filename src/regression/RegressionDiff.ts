import type { PythonVerificationResult } from '../port/types.js';
import type { PureVerificationResult } from '../pure/types.js';
import type { RegressionBaseline, RegressionRunResult } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function firstChangedPath(expected: unknown, actual: unknown, pathName = '$'): string {
  if (sameJson(expected, actual)) {
    return pathName;
  }
  if (!isRecord(expected) || !isRecord(actual)) {
    return pathName;
  }
  const keys = Array.from(new Set([...Object.keys(expected), ...Object.keys(actual)])).sort();
  for (const key of keys) {
    if (!sameJson(expected[key], actual[key])) {
      return firstChangedPath(expected[key], actual[key], `${pathName}.${key}`);
    }
  }
  return pathName;
}

export class RegressionDiff {
  diff(input: {
    baseline: RegressionBaseline;
    nodeVerification: PureVerificationResult;
    pythonVerification?: PythonVerificationResult | null;
  }): RegressionRunResult {
    const nodeOutput = input.nodeVerification.pureOutput;
    const pythonOutput = input.pythonVerification?.pythonOutput;
    const nodeMatches = input.baseline.expectedNodeOutput === undefined ||
      sameJson(input.baseline.expectedNodeOutput, nodeOutput);
    const pythonMatches = !input.baseline.pythonEntryFile ||
      input.baseline.expectedPythonOutput === undefined ||
      sameJson(input.baseline.expectedPythonOutput, pythonOutput);
    const crossMatches = !input.baseline.pythonEntryFile || input.pythonVerification?.ok === true;
    const divergence = this.firstDivergence(input.baseline, input.nodeVerification, input.pythonVerification);
    const matchedBaseline = nodeMatches && pythonMatches && crossMatches && divergence === null;

    return {
      baselineId: input.baseline.baselineId,
      divergence,
      executedAt: new Date().toISOString(),
      matchedBaseline,
      nextActionHint: this.nextActionHint(divergence),
      node: {
        error: input.nodeVerification.divergence,
        ok: input.nodeVerification.ok && nodeMatches,
        output: nodeOutput
      },
      notes: [
        'Regression compares current pure outputs against the registered fixture baseline.',
        matchedBaseline
          ? 'Current outputs match the registered baseline.'
          : 'A first divergence was found; do not refresh the baseline until acceptance is rechecked.'
      ],
      python: input.baseline.pythonEntryFile
        ? {
            error: input.pythonVerification?.divergence,
            ok: Boolean(input.pythonVerification?.ok && pythonMatches),
            output: pythonOutput
          }
        : null,
      runId: `regression-${Date.now()}`
    };
  }

  private firstDivergence(
    baseline: RegressionBaseline,
    nodeVerification: PureVerificationResult,
    pythonVerification?: PythonVerificationResult | null
  ): RegressionRunResult['divergence'] {
    if (!nodeVerification.ok) {
      return {
        actual: nodeVerification.divergence,
        expected: baseline.expectedNodeOutput,
        layer: 'node',
        message: 'Node pure verification failed before baseline comparison.',
        path: nodeVerification.divergence?.path ?? '$.node'
      };
    }

    if (baseline.expectedNodeOutput !== undefined && !sameJson(baseline.expectedNodeOutput, nodeVerification.pureOutput)) {
      return {
        actual: nodeVerification.pureOutput,
        expected: baseline.expectedNodeOutput,
        layer: 'baseline',
        message: 'Node pure output diverged from registered baseline.',
        path: firstChangedPath(baseline.expectedNodeOutput, nodeVerification.pureOutput)
      };
    }

    if (baseline.pythonEntryFile) {
      if (!pythonVerification?.ok) {
        return {
          actual: pythonVerification?.divergence,
          expected: baseline.expectedPythonOutput,
          layer: 'python',
          message: 'Python pure verification failed before baseline comparison.',
          path: pythonVerification?.divergence?.path ?? '$.python'
        };
      }

      if (baseline.expectedPythonOutput !== undefined && !sameJson(baseline.expectedPythonOutput, pythonVerification.pythonOutput)) {
        return {
          actual: pythonVerification.pythonOutput,
          expected: baseline.expectedPythonOutput,
          layer: 'baseline',
          message: 'Python pure output diverged from registered baseline.',
          path: firstChangedPath(baseline.expectedPythonOutput, pythonVerification.pythonOutput)
        };
      }
    }

    return null;
  }

  private nextActionHint(divergence: RegressionRunResult['divergence']): string {
    if (!divergence) {
      return 'Regression matched. Keep this baseline and proceed to delivery packaging.';
    }

    switch (divergence.layer) {
      case 'node':
        return 'Fix Node pure baseline first; Python and SDK packaging depend on it.';
      case 'python':
        return 'Sync Python pure with Node before delivery.';
      case 'cross-language':
        return 'Resolve the cross-language first divergence before refreshing baseline.';
      case 'baseline':
        return 'Refresh baseline only after acceptance re-check confirms the new behavior.';
    }
  }
}
