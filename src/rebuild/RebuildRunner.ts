import { spawn } from 'node:child_process';
import path from 'node:path';

import type { EnvAccessLogger } from './EnvAccessLogger.js';
import type { RebuildRunOptions, RebuildRunResult } from './types.js';

export class RebuildRunner {
  constructor(private readonly envAccessLogger: EnvAccessLogger) {}

  async run(options: RebuildRunOptions): Promise<RebuildRunResult> {
    const startedAt = new Date();
    const entryFile = path.resolve(options.bundleDir, options.entryFile ?? 'entry.js');
    const timeoutMs = options.timeoutMs ?? 10_000;
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const result = await new Promise<{
      exitCode: number | null;
      signal: string | null;
    }>((resolve) => {
      const child = spawn(process.execPath, [entryFile], {
        cwd: options.bundleDir,
        env: {
          ...process.env,
          JSAGENT_ENV_OVERRIDES: JSON.stringify(options.envOverrides ?? {}),
          ...(options.fixturePath ? { JSAGENT_FIXTURE_PATH: options.fixturePath } : {})
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

    const endedAt = new Date();
    const parsed = this.parseStructuredOutput(stdout, stderr);
    const envAccessLog = parsed.envAccessLog;
    const warnings = timedOut ? [`Rebuild probe timed out after ${timeoutMs}ms.`] : undefined;

    return {
      durationMs: endedAt.getTime() - startedAt.getTime(),
      endedAt: endedAt.toISOString(),
      envAccessLog,
      envAccessSummary: this.envAccessLogger.summarize(envAccessLog),
      exitCode: result.exitCode,
      ok: !timedOut && result.exitCode === 0 && !parsed.parsedError,
      parsedError: parsed.parsedError,
      parsedResult: parsed.parsedResult,
      signal: result.signal,
      startedAt: startedAt.toISOString(),
      stderr,
      stdout,
      ...(warnings ? { warnings } : {})
    };
  }

  private parseStructuredOutput(stdout: string, stderr: string): {
    parsedResult?: unknown;
    parsedError?: unknown;
    envAccessLog: unknown[];
  } {
    let parsedResult: unknown;
    let parsedError: unknown;
    let envAccessLog: unknown[] = [];

    for (const line of [...stdout.split(/\r?\n/), ...stderr.split(/\r?\n/)]) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) {
        continue;
      }

      try {
        const value = JSON.parse(trimmed) as Record<string, unknown>;
        if ('__jsagent_result__' in value) {
          parsedResult = value.__jsagent_result__;
        }
        if ('__jsagent_error__' in value) {
          parsedError = value.__jsagent_error__;
        }
        if ('__jsagent_env_access__' in value && Array.isArray(value.__jsagent_env_access__)) {
          envAccessLog = value.__jsagent_env_access__;
        }
      } catch {
        // Non-structured output is retained in stdout/stderr.
      }
    }

    return {
      envAccessLog,
      parsedError,
      parsedResult
    };
  }
}
