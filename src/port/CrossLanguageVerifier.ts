import { spawn } from 'node:child_process';
import path from 'node:path';

import type { PythonDivergence, PythonVerificationResult } from './types.js';

type ProcessRun = {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnError?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function compareValues(expected: unknown, actual: unknown, pathName = '$'): PythonDivergence | null {
  if (Object.is(expected, actual)) {
    return null;
  }

  if (typeof expected !== typeof actual) {
    return {
      actual,
      expected,
      kind: 'output-mismatch',
      message: `Type mismatch at ${pathName}: expected ${typeof expected}, got ${typeof actual}.`,
      path: pathName
    };
  }

  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      return {
        actual,
        expected,
        kind: 'output-mismatch',
        message: `Array shape mismatch at ${pathName}.`,
        path: pathName
      };
    }
    if (expected.length !== actual.length) {
      return {
        actual: actual.length,
        expected: expected.length,
        kind: 'output-mismatch',
        message: `Array length mismatch at ${pathName}.`,
        path: `${pathName}.length`
      };
    }
    for (let index = 0; index < expected.length; index += 1) {
      const nested = compareValues(expected[index], actual[index], `${pathName}[${index}]`);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  if (isRecord(expected) || isRecord(actual)) {
    if (!isRecord(expected) || !isRecord(actual)) {
      return {
        actual,
        expected,
        kind: 'output-mismatch',
        message: `Object shape mismatch at ${pathName}.`,
        path: pathName
      };
    }
    const keys = Array.from(new Set([...Object.keys(expected), ...Object.keys(actual)])).sort();
    for (const key of keys) {
      if (!(key in expected)) {
        return {
          actual: actual[key],
          expected: undefined,
          kind: 'output-mismatch',
          message: `Unexpected key ${key} in Python output.`,
          path: `${pathName}.${key}`
        };
      }
      if (!(key in actual)) {
        return {
          actual: undefined,
          expected: expected[key],
          kind: 'output-mismatch',
          message: `Missing key ${key} in Python output.`,
          path: `${pathName}.${key}`
        };
      }
      const nested = compareValues(expected[key], actual[key], `${pathName}.${key}`);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  return {
    actual,
    expected,
    kind: 'output-mismatch',
    message: `Value mismatch at ${pathName}.`,
    path: pathName
  };
}

export class CrossLanguageVerifier {
  async verify(options: {
    nodeEntryFile: string;
    pythonEntryFile: string;
    fixtureFile: string;
    timeoutMs?: number;
  }): Promise<PythonVerificationResult> {
    const timeoutMs = options.timeoutMs ?? 10_000;
    const nodeRun = await this.runProcess(process.execPath, [options.nodeEntryFile], {
      cwd: path.dirname(options.nodeEntryFile),
      env: {
        ...process.env,
        JSAGENT_PURE_FIXTURE: options.fixtureFile
      },
      timeoutMs
    });
    const nodeParsed = this.parseStructuredOutput(nodeRun.stdout, nodeRun.stderr, {
      errorKey: '__jsagent_pure_error__',
      resultKey: '__jsagent_pure_result__'
    });

    const notes = [
      'Cross-language verification uses the same fixture file for Node and Python.',
      'Node pure output is the baseline; Python output is compared against it deterministically.'
    ];

    if (nodeRun.timedOut || nodeRun.spawnError || nodeParsed.error) {
      return {
        divergence: {
          actual: nodeParsed.error ?? nodeRun.stderr.trim() ?? nodeRun.spawnError,
          kind: 'node-error',
          message: nodeRun.timedOut
            ? `Node pure timed out after ${timeoutMs}ms.`
            : this.stringifyError(nodeParsed.error ?? nodeRun.spawnError ?? nodeRun.stderr),
          path: '$.node'
        },
        nodeOutput: nodeParsed.result,
        notes: [...notes, 'Fix Node pure baseline before touching Python scaffold.'],
        ok: false,
        verifiedAt: new Date().toISOString()
      };
    }

    if (nodeParsed.result === undefined) {
      return {
        divergence: {
          kind: 'no-output',
          message: 'Node pure emitted no structured __jsagent_pure_result__ payload.',
          path: '$.node.__jsagent_pure_result__'
        },
        notes: [...notes, 'Fix Node pure entry output before Python verification.'],
        ok: false,
        verifiedAt: new Date().toISOString()
      };
    }

    const pythonCommand = process.env.PYTHON || 'python';
    const pythonRun = await this.runProcess(pythonCommand, [options.pythonEntryFile], {
      cwd: path.dirname(options.pythonEntryFile),
      env: {
        ...process.env,
        JSAGENT_PYTHON_FIXTURE: options.fixtureFile
      },
      timeoutMs
    });
    const pythonParsed = this.parseStructuredOutput(pythonRun.stdout, pythonRun.stderr, {
      errorKey: '__jsagent_python_error__',
      resultKey: '__jsagent_python_result__'
    });

    if (pythonRun.timedOut || pythonRun.spawnError || pythonParsed.error) {
      return {
        divergence: {
          actual: pythonParsed.error ?? pythonRun.stderr.trim() ?? pythonRun.spawnError,
          expected: nodeParsed.result,
          kind: 'python-error',
          message: pythonRun.timedOut
            ? `Python pure timed out after ${timeoutMs}ms.`
            : this.stringifyError(pythonParsed.error ?? pythonRun.spawnError ?? pythonRun.stderr),
          path: '$.python'
        },
        nodeOutput: nodeParsed.result,
        notes: [
          ...notes,
          pythonRun.spawnError
            ? 'Python execution failed. Ensure Python is installed or set the PYTHON environment variable.'
            : 'Fix Python scaffold/runtime before comparing algorithm output.'
        ],
        ok: false,
        pythonOutput: pythonParsed.result,
        verifiedAt: new Date().toISOString()
      };
    }

    if (pythonParsed.result === undefined) {
      return {
        divergence: {
          expected: nodeParsed.result,
          kind: 'no-output',
          message: 'Python pure emitted no structured __jsagent_python_result__ payload.',
          path: '$.python.__jsagent_python_result__'
        },
        nodeOutput: nodeParsed.result,
        notes: [...notes, 'Inspect pure_entry.py before changing boundary or Node pure.'],
        ok: false,
        verifiedAt: new Date().toISOString()
      };
    }

    const divergence = compareValues(nodeParsed.result, pythonParsed.result);
    return {
      divergence,
      nodeOutput: nodeParsed.result,
      notes: divergence
        ? [...notes, 'Mismatch is the cross-language first divergence; resolve it before SDK wrapping.']
        : [...notes, 'Python output matched the Node pure baseline.'],
      ok: divergence === null,
      pythonOutput: pythonParsed.result,
      verifiedAt: new Date().toISOString()
    };
  }

  private async runProcess(
    command: string,
    args: string[],
    options: {
      cwd: string;
      env: NodeJS.ProcessEnv;
      timeoutMs: number;
    }
  ): Promise<ProcessRun> {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    return await new Promise<ProcessRun>((resolve) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        windowsHide: true
      });
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, options.timeoutMs);

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve({
          exitCode: null,
          signal: null,
          spawnError: `${error.name}: ${error.message}`,
          stderr,
          stdout,
          timedOut
        });
      });
      child.on('close', (exitCode, signal) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve({
          exitCode,
          signal,
          stderr,
          stdout,
          timedOut
        });
      });
    });
  }

  private parseStructuredOutput(
    stdout: string,
    stderr: string,
    keys: {
      resultKey: string;
      errorKey: string;
    }
  ): {
    result?: unknown;
    error?: unknown;
  } {
    let result: unknown;
    let error: unknown;

    for (const line of [...stdout.split(/\r?\n/), ...stderr.split(/\r?\n/)]) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) {
        continue;
      }
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        if (keys.resultKey in parsed) {
          result = parsed[keys.resultKey];
        }
        if (keys.errorKey in parsed) {
          error = parsed[keys.errorKey];
        }
      } catch {
        // Ignore non-JSON diagnostic lines.
      }
    }

    return { error, result };
  }

  private stringifyError(error: unknown): string {
    if (isRecord(error)) {
      return [error.name, error.message].filter((item): item is string => typeof item === 'string').join(': ') ||
        stringify(error);
    }
    return stringify(error);
  }
}
