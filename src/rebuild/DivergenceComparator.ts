import type {
  DivergenceComparisonResult,
  DivergenceRecord,
  RebuildRunResult,
  RuntimeFixture
} from './types.js';

export class DivergenceComparator {
  async compare(input: {
    fixture?: RuntimeFixture;
    runResult: RebuildRunResult;
    expected?: unknown;
  }): Promise<DivergenceComparisonResult> {
    const comparedAt = new Date().toISOString();
    const notes = ['First-divergence comparison is deterministic and reports only the first explainable mismatch.'];
    const runtimeError = this.stringifyError(input.runResult.parsedError) || input.runResult.stderr;

    if (input.runResult.parsedError || input.runResult.stderr.trim().length > 0 && !input.runResult.ok) {
      return {
        comparedAt,
        divergence: this.classifyRuntimeError(runtimeError),
        matched: false,
        notes
      };
    }

    if (input.runResult.parsedResult === undefined) {
      return {
        comparedAt,
        divergence: {
          kind: 'no-output',
          message: 'Rebuild probe did not emit a structured __jsagent_result__ payload.',
          path: '$.__jsagent_result__',
          severity: 'medium'
        },
        matched: false,
        notes
      };
    }

    if (input.expected !== undefined) {
      const divergence = this.compareValues('$', input.expected, input.runResult.parsedResult);
      if (divergence) {
        return {
          comparedAt,
          divergence,
          matched: false,
          notes
        };
      }
    }

    notes.push(input.fixture ? `Compared with fixture from ${input.fixture.source}.` : 'No fixture was provided; matched means the probe produced structured output without a known expected mismatch.');
    return {
      comparedAt,
      divergence: null,
      matched: true,
      notes
    };
  }

  private classifyRuntimeError(errorText: string): DivergenceRecord {
    const referenceMatch = /ReferenceError:\s*([A-Za-z_$][\w$]*)\s+is not defined/i.exec(errorText);
    if (referenceMatch?.[1]) {
      return {
        actual: undefined,
        kind: 'missing-global',
        message: `${referenceMatch[1]} is not defined in the local rebuild environment.`,
        path: referenceMatch[1],
        severity: 'high'
      };
    }

    const readingMatch = /Cannot read (?:properties|property) of undefined \(reading ['"]([^'"]+)['"]\)/i.exec(errorText);
    if (readingMatch?.[1]) {
      return {
        actual: undefined,
        kind: 'missing-property',
        message: `A required property is missing: ${readingMatch[1]}.`,
        path: readingMatch[1],
        severity: 'high'
      };
    }

    const functionMatch = /([A-Za-z_$][\w$.]*) is not a function/i.exec(errorText);
    if (functionMatch?.[1]) {
      return {
        actual: 'not-function',
        kind: 'type-mismatch',
        message: `${functionMatch[1]} must be callable for this rebuild path.`,
        path: functionMatch[1],
        severity: 'high'
      };
    }

    for (const name of ['crypto.subtle', 'TextEncoder', 'TextDecoder', 'atob', 'btoa', 'performance', 'localStorage', 'navigator', 'document', 'window']) {
      if (errorText.toLowerCase().includes(name.toLowerCase())) {
        return {
          actual: undefined,
          kind: name.includes('.') ? 'missing-property' : 'missing-global',
          message: `Runtime error points at missing or incomplete ${name}.`,
          path: name,
          severity: 'high'
        };
      }
    }

    return {
      kind: 'runtime-error',
      message: errorText.slice(0, 500) || 'Local rebuild failed with an unknown runtime error.',
      path: '$',
      severity: 'medium'
    };
  }

  private compareValues(path: string, expected: unknown, actual: unknown): DivergenceRecord | null {
    if (typeof expected !== typeof actual) {
      return {
        actual,
        expected,
        kind: 'type-mismatch',
        message: `Type mismatch at ${path}: expected ${typeof expected}, got ${typeof actual}.`,
        path,
        severity: 'medium'
      };
    }

    if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
      const expectedRecord = expected as Record<string, unknown>;
      const actualRecord = actual as Record<string, unknown>;
      for (const key of Object.keys(expectedRecord).slice(0, 30)) {
        if (!(key in actualRecord)) {
          return {
            actual: undefined,
            expected: expectedRecord[key],
            kind: 'missing-property',
            message: `Expected output key is missing: ${key}.`,
            path: `${path}.${key}`,
            severity: 'medium'
          };
        }
        const nested = this.compareValues(`${path}.${key}`, expectedRecord[key], actualRecord[key]);
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
        kind: 'value-mismatch',
        message: `Value mismatch at ${path}.`,
        path,
        severity: 'medium'
      };
    }

    return null;
  }

  private stringifyError(error: unknown): string {
    if (!error) {
      return '';
    }
    if (typeof error === 'string') {
      return error;
    }
    if (typeof error === 'object') {
      const record = error as Record<string, unknown>;
      return [record.name, record.message, record.stack].filter((item): item is string => typeof item === 'string').join('\n');
    }
    return String(error);
  }
}
