import type { PureDivergence } from './types.js';

export function comparePureOutputs(expected: unknown, actual: unknown, path = '$'): PureDivergence | null {
  if (typeof expected !== typeof actual) {
    return {
      actual,
      expected,
      kind: 'output-mismatch',
      message: `Type mismatch at ${path}: expected ${typeof expected}, got ${typeof actual}.`,
      path
    };
  }

  if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
    const expectedRecord = expected as Record<string, unknown>;
    const actualRecord = actual as Record<string, unknown>;
    for (const key of Object.keys(expectedRecord).slice(0, 50)) {
      if (!(key in actualRecord)) {
        return {
          actual: undefined,
          expected: expectedRecord[key],
          kind: 'output-mismatch',
          message: `Output key is missing: ${key}.`,
          path: `${path}.${key}`
        };
      }
      const nested = comparePureOutputs(expectedRecord[key], actualRecord[key], `${path}.${key}`);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  if (!Object.is(expected, actual)) {
    return {
      actual,
      expected,
      kind: 'output-mismatch',
      message: `Output value mismatch at ${path}.`,
      path
    };
  }

  return null;
}
