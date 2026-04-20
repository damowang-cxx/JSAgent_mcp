import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { comparePureOutputs } from './divergence.js';
import type { PureFixture, PureVerificationResult } from './types.js';

export class PureVerifier {
  async verify(options: {
    entryFile: string;
    fixtureFile: string;
    expectedOutput?: unknown;
    timeoutMs?: number;
  }): Promise<PureVerificationResult> {
    const startedAt = new Date();
    const timeoutMs = options.timeoutMs ?? 10_000;
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const result = await new Promise<{ exitCode: number | null; signal: string | null }>((resolve) => {
      const child = spawn(process.execPath, [options.entryFile], {
        cwd: path.dirname(options.entryFile),
        env: {
          ...process.env,
          JSAGENT_PURE_FIXTURE: options.fixtureFile
        },
        windowsHide: true
      });
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, timeoutMs);
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', (error) => {
        stderr += `${error.name}: ${error.message}\n`;
      });
      child.on('close', (exitCode, signal) => {
        clearTimeout(timer);
        resolve({ exitCode, signal });
      });
    });

    const fixture = await this.readFixture(options.fixtureFile);
    const expectedOutput = options.expectedOutput !== undefined ? options.expectedOutput : fixture?.expectedOutput;
    const parsed = this.parsePureOutput(stdout, stderr);
    const notes = [
      `Pure verifier duration: ${Date.now() - startedAt.getTime()}ms.`,
      'Verification compares fixture expectedOutput with Node pure output deterministically.'
    ];

    if (timedOut) {
      return {
        divergence: {
          kind: 'pure-error',
          message: `Pure verification timed out after ${timeoutMs}ms.`,
          path: '$.process'
        },
        notes,
        ok: false,
        runtimeOutput: expectedOutput,
        verifiedAt: new Date().toISOString()
      };
    }

    if (parsed.error) {
      return {
        divergence: {
          actual: parsed.error,
          expected: expectedOutput,
          kind: 'pure-error',
          message: this.stringifyError(parsed.error),
          path: '$.pure'
        },
        notes: [...notes, 'Return to pure implementation before porting; the Node scaffold threw an error.'],
        ok: false,
        runtimeOutput: expectedOutput,
        verifiedAt: new Date().toISOString()
      };
    }

    if (parsed.result === undefined) {
      return {
        divergence: {
          kind: 'no-output',
          message: `Pure entry emitted no structured result. exitCode=${result.exitCode}, signal=${result.signal ?? 'none'}.`,
          path: '$.__jsagent_pure_result__'
        },
        notes: [...notes, stderr.trim() ? stderr.trim().slice(0, 500) : 'No stderr was emitted.'],
        ok: false,
        runtimeOutput: expectedOutput,
        verifiedAt: new Date().toISOString()
      };
    }

    const divergence = comparePureOutputs(expectedOutput, parsed.result);
    return {
      divergence,
      notes: divergence
        ? [...notes, 'Pure output diverged; refine boundary or pure implementation before porting.']
        : [...notes, 'Pure output matched the frozen fixture expectedOutput.'],
      ok: divergence === null,
      pureOutput: parsed.result,
      runtimeOutput: expectedOutput,
      verifiedAt: new Date().toISOString()
    };
  }

  private async readFixture(fixtureFile: string): Promise<PureFixture | null> {
    try {
      const raw = await readFile(fixtureFile, 'utf8');
      return JSON.parse(raw) as PureFixture;
    } catch {
      return null;
    }
  }

  private parsePureOutput(stdout: string, stderr: string): {
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
        if ('__jsagent_pure_result__' in parsed) {
          result = parsed.__jsagent_pure_result__;
        }
        if ('__jsagent_pure_error__' in parsed) {
          error = parsed.__jsagent_pure_error__;
        }
      } catch {
        // Ignore non-structured lines.
      }
    }

    return { error, result };
  }

  private stringifyError(error: unknown): string {
    if (error && typeof error === 'object') {
      const record = error as Record<string, unknown>;
      return [record.name, record.message].filter((item): item is string => typeof item === 'string').join(': ') || 'Pure entry failed.';
    }
    return String(error);
  }
}
