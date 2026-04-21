import type { IntermediateRegressionResult } from '../regression/types.js';

type IntermediateDivergence = NonNullable<IntermediateRegressionResult['divergence']>;

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

export class IntermediateDiff {
  async diff(input: {
    expected?: Record<string, unknown>;
    actual?: Record<string, unknown>;
    layer: IntermediateDivergence['layer'];
  }): Promise<IntermediateDivergence | null> {
    if (!input.expected || !input.actual) {
      return null;
    }

    if (sameJson(input.expected, input.actual)) {
      return null;
    }

    const path = firstChangedPath(input.expected, input.actual);
    return {
      actual: input.actual,
      expected: input.expected,
      layer: input.layer,
      message: `First divergence detected at ${path}.`,
      path
    };
  }
}
