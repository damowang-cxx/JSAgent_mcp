import type { UpgradeDiffResult } from './types.js';

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function collectParts(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value as Record<string, unknown>).sort();
}

export class UpgradeDiffRunner {
  async analyze(options: {
    oldSample?: {
      nodeOutput?: unknown;
      pythonOutput?: unknown;
    };
    newSample?: {
      runtimeOutput?: unknown;
      nodeOutput?: unknown;
      pythonOutput?: unknown;
    };
    targetDescription?: string;
  }): Promise<UpgradeDiffResult> {
    const oldNode = options.oldSample?.nodeOutput;
    const oldPython = options.oldSample?.pythonOutput;
    const newRuntime = options.newSample?.runtimeOutput;
    const newNode = options.newSample?.nodeOutput;
    const newPython = options.newSample?.pythonOutput;

    const unchangedParts = Array.from(new Set([
      ...collectParts(oldNode),
      ...collectParts(newNode)
    ])).filter((key) => JSON.stringify((oldNode as Record<string, unknown> | undefined)?.[key]) ===
      JSON.stringify((newNode as Record<string, unknown> | undefined)?.[key]));
    const changedParts = Array.from(new Set([
      ...collectParts(oldNode),
      ...collectParts(newNode)
    ])).filter((key) => !unchangedParts.includes(key));

    const divergence = this.firstDivergence({
      newNode,
      newPython,
      newRuntime,
      oldNode,
      oldPython
    });

    return {
      changedParts,
      createdAt: new Date().toISOString(),
      firstDivergence: divergence,
      notes: [
        'Upgrade diff is deterministic and layer-oriented; it is not an automatic upgrade fixer.',
        divergence
          ? `First divergence layer: ${divergence.layer}.`
          : 'No final-output divergence was detected from the supplied samples.'
      ],
      recommendation: this.recommend(divergence),
      targetDescription: options.targetDescription,
      unchangedParts
    };
  }

  private firstDivergence(input: {
    oldNode?: unknown;
    oldPython?: unknown;
    newRuntime?: unknown;
    newNode?: unknown;
    newPython?: unknown;
  }): UpgradeDiffResult['firstDivergence'] {
    if (input.newRuntime !== undefined && input.newNode !== undefined && !sameJson(input.newRuntime, input.newNode)) {
      return {
        actual: input.newNode,
        expected: input.newRuntime,
        layer: 'final-output',
        message: 'New runtime output diverges from Node pure output.'
      };
    }

    if (input.newNode !== undefined && input.newPython !== undefined && !sameJson(input.newNode, input.newPython)) {
      return {
        actual: input.newPython,
        expected: input.newNode,
        layer: 'final-output',
        message: 'Python pure output diverges from Node pure output.'
      };
    }

    if (input.oldNode !== undefined && input.newNode !== undefined && !sameJson(input.oldNode, input.newNode)) {
      return {
        actual: input.newNode,
        expected: input.oldNode,
        layer: 'final-output',
        message: 'Node pure output changed between old and new samples.'
      };
    }

    if (input.oldPython !== undefined && input.newPython !== undefined && !sameJson(input.oldPython, input.newPython)) {
      return {
        actual: input.newPython,
        expected: input.oldPython,
        layer: 'final-output',
        message: 'Python pure output changed between old and new samples.'
      };
    }

    return null;
  }

  private recommend(divergence: UpgradeDiffResult['firstDivergence']): string {
    if (!divergence) {
      return 'Keep the fixture and baseline; no upgrade-specific action is required from the supplied samples.';
    }

    if (/runtime output diverges/i.test(divergence.message)) {
      return 'Refine the pure boundary or Node pure implementation before changing Python.';
    }

    if (/Python pure output diverges/i.test(divergence.message)) {
      return 'Sync Python pure with the Node baseline before SDK packaging.';
    }

    return 'Analyze the changed final output with the same fixture before broad environment patching.';
  }
}
