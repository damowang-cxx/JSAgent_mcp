import { spawn } from 'node:child_process';
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { RuntimeTraceExport } from './types.js';
import { nowStamp } from './serialization.js';

export class RuntimeTraceSampler {
  async sample(options: {
    bundleDir: string;
    targetFunctionName?: string;
    probeExpressions?: string[];
    timeoutMs?: number;
    fixturePath?: string;
  }): Promise<RuntimeTraceExport> {
    const warnings: string[] = [];
    const traceRunner = path.join(options.bundleDir, `.jsagent-runtime-trace-${nowStamp()}.mjs`);
    await writeFile(traceRunner, this.buildTraceRunner(options), 'utf8');

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeoutMs = options.timeoutMs ?? 10_000;
    const result = await new Promise<{ exitCode: number | null; signal: string | null }>((resolve) => {
      const child = spawn(process.execPath, [traceRunner], {
        cwd: options.bundleDir,
        env: {
          ...process.env,
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

    if (timedOut) {
      warnings.push(`Runtime trace timed out after ${timeoutMs}ms.`);
    }
    if (result.exitCode !== 0) {
      warnings.push(`Trace runner exited with code ${result.exitCode ?? 'null'} and signal ${result.signal ?? 'none'}.`);
    }
    if (stderr.trim().length > 0) {
      warnings.push(stderr.trim().slice(0, 500));
    }

    const parsed = this.parseTrace(stdout);
    return {
      createdAt: new Date().toISOString(),
      records: parsed.records,
      sourceBundleDir: options.bundleDir,
      targetFunctionName: options.targetFunctionName ?? null,
      warnings: [...warnings, ...parsed.warnings]
    };
  }

  private buildTraceRunner(options: {
    targetFunctionName?: string;
    probeExpressions?: string[];
  }): string {
    return `
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const records = [];
const warnings = [];
const bundleDir = process.cwd();
const targetFunctionName = ${JSON.stringify(options.targetFunctionName ?? null)};
const probeExpressions = ${JSON.stringify(options.probeExpressions ?? [])};

function record(kind, target, value, meta = {}) {
  records.push({
    traceId: 'trace-' + records.length,
    kind,
    target,
    timestamp: new Date().toISOString(),
    value,
    meta
  });
}

await importIfExists('env-shim.js');
await importIfExists('env-access-logger.js');
globalThis.__JSAGENT_FIXTURE__ = loadFixture();

try {
  for (const relativeFile of findTargetFiles()) {
    const code = readFileSync(path.join(bundleDir, relativeFile), 'utf8');
    vm.runInThisContext(code, { filename: relativeFile });
  }
  record('intermediate', 'bundle-loaded', { targetFunctionName });
} catch (error) {
  record('error', 'bundle-load', errorSummary(error));
}

for (const expression of probeExpressions) {
  try {
    record('intermediate', expression, vm.runInThisContext(expression));
  } catch (error) {
    record('error', expression, errorSummary(error));
  }
}

if (targetFunctionName) {
  const target = globalThis[targetFunctionName];
  if (typeof target === 'function') {
    const args = inferArgs(globalThis.__JSAGENT_FIXTURE__);
    record('call', targetFunctionName, args, { argsLength: args.length });
    try {
      const value = await target(...args);
      record('return', targetFunctionName, value);
    } catch (error) {
      record('error', targetFunctionName, errorSummary(error));
    }
  } else {
    warnings.push('targetFunctionName was not callable in rebuild runtime: ' + targetFunctionName);
  }
}

console.log(JSON.stringify({ __jsagent_runtime_trace__: { records, warnings } }));

async function importIfExists(fileName) {
  const filePath = path.join(bundleDir, fileName);
  if (!existsSync(filePath)) {
    return;
  }
  try {
    await import(pathToFileURL(filePath).href);
  } catch (error) {
    warnings.push('Failed to import ' + fileName + ': ' + (error?.message ?? String(error)));
  }
}

function findTargetFiles() {
  if (existsSync(path.join(bundleDir, 'target.js'))) {
    return ['target.js'];
  }
  const targetDir = path.join(bundleDir, 'targets');
  if (existsSync(targetDir)) {
    return readdirSync(targetDir).filter((name) => name.endsWith('.js')).sort().map((name) => 'targets/' + name);
  }
  return [];
}

function loadFixture() {
  const fixturePath = process.env.JSAGENT_FIXTURE_PATH || path.join(bundleDir, 'fixture.json');
  if (!existsSync(fixturePath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(fixturePath, 'utf8'));
  } catch (error) {
    warnings.push('Failed to load fixture: ' + (error?.message ?? String(error)));
    return null;
  }
}

function inferArgs(fixture) {
  const firstHook = fixture?.hookSamples?.[0]?.record;
  if (Array.isArray(firstHook?.args)) {
    return firstHook.args;
  }
  const firstRequest = fixture?.requestSamples?.[0];
  if (firstRequest) {
    return [firstRequest.postData ?? firstRequest.url];
  }
  return [];
}

function errorSummary(error) {
  return {
    name: error?.name ?? 'Error',
    message: error?.message ?? String(error),
    stack: error?.stack
  };
}
`.trim();
  }

  private parseTrace(stdout: string): {
    records: RuntimeTraceExport['records'];
    warnings: string[];
  } {
    for (const line of stdout.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) {
        continue;
      }
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        const trace = parsed.__jsagent_runtime_trace__;
        if (trace && typeof trace === 'object') {
          const record = trace as { records?: RuntimeTraceExport['records']; warnings?: string[] };
          return {
            records: Array.isArray(record.records) ? record.records : [],
            warnings: Array.isArray(record.warnings) ? record.warnings : []
          };
        }
      } catch {
        // Ignore non-trace JSON lines.
      }
    }

    return {
      records: [],
      warnings: ['Trace runner did not emit a structured __jsagent_runtime_trace__ payload.']
    };
  }
}
