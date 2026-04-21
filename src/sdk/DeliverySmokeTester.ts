import { spawn } from 'node:child_process';
import path from 'node:path';

import type { DeliveryBundleExport, DeliverySmokeTestResult } from './types.js';

type ProcessResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
};

export class DeliverySmokeTester {
  async test(options: {
    bundleDir: string;
    target: 'node' | 'python' | 'dual';
    timeoutMs?: number;
  }): Promise<DeliverySmokeTestResult> {
    const timeoutMs = options.timeoutMs ?? 10_000;
    const node = options.target === 'node' || options.target === 'dual'
      ? await this.runProcess(process.execPath, [path.join(options.bundleDir, 'smoke-node.mjs')], options.bundleDir, timeoutMs)
      : null;
    const python = options.target === 'python' || options.target === 'dual'
      ? await this.runProcess(process.env.PYTHON || 'python', [path.join(options.bundleDir, 'smoke_python.py')], options.bundleDir, timeoutMs)
      : null;
    const ok = (node?.ok ?? true) && (python?.ok ?? true);

    return {
      nextActionHint: ok
        ? 'Delivery smoke test passed. Keep this bundle as the current distribution artifact.'
        : this.nextActionHint(node, python),
      node,
      notes: [
        'Smoke test executes the bundle-provided smoke entry, not the original workspace source directly.',
        ...(node?.ok === false || python?.ok === false ? ['At least one delivery smoke target failed; inspect stderr before distribution.'] : [])
      ],
      ok,
      python,
      target: options.target,
      testedAt: new Date().toISOString()
    };
  }

  private async runProcess(command: string, args: string[], cwd: string, timeoutMs: number): Promise<ProcessResult> {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const ok = await new Promise<boolean>((resolve) => {
      const child = spawn(command, args, {
        cwd,
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
        stderr += `${error.name}: ${error.message}`;
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve(code === 0 && !timedOut);
      });
    });

    return {
      ok,
      stderr: timedOut ? `${stderr}\nTimed out after ${timeoutMs}ms.`.trim() : stderr,
      stdout
    };
  }

  private nextActionHint(node: ProcessResult | null, python: ProcessResult | null): string {
    if (node?.ok === false) {
      return 'Fix the Node delivery smoke entry or bundled implementation before distribution.';
    }
    if (python?.ok === false) {
      return 'Fix the Python delivery smoke entry or bundled implementation before distribution.';
    }
    return 'Inspect bundle smoke entries and bundled implementations before distribution.';
  }
}
