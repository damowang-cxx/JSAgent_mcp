import type { CrossLanguageDiffResult, PythonVerificationResult } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function topLevelKeys(value: unknown): string[] {
  return isRecord(value) ? Object.keys(value).sort() : [];
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function topLevelValue(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

export class CrossLanguageDiff {
  async diff(input: {
    nodeOutput?: unknown;
    pythonOutput?: unknown;
    verification: PythonVerificationResult;
  }): Promise<CrossLanguageDiffResult> {
    const nodeOutput = input.nodeOutput !== undefined ? input.nodeOutput : input.verification.nodeOutput;
    const pythonOutput = input.pythonOutput !== undefined ? input.pythonOutput : input.verification.pythonOutput;
    const nodeKeys = topLevelKeys(nodeOutput);
    const pythonKeys = topLevelKeys(pythonOutput);
    const unchangedParts = nodeKeys.filter((key) => (
      pythonKeys.includes(key) &&
      sameJson(topLevelValue(nodeOutput, key), topLevelValue(pythonOutput, key))
    ));
    const changedParts = Array.from(new Set([...nodeKeys, ...pythonKeys]))
      .filter((key) => (
        !nodeKeys.includes(key) ||
        !pythonKeys.includes(key) ||
        !sameJson(topLevelValue(nodeOutput, key), topLevelValue(pythonOutput, key))
      ))
      .sort();
    if (nodeKeys.length === 0 && pythonKeys.length === 0 && !sameJson(nodeOutput, pythonOutput)) {
      changedParts.push('$');
    }
    if (nodeKeys.length === 0 && pythonKeys.length === 0 && sameJson(nodeOutput, pythonOutput) && nodeOutput !== undefined) {
      unchangedParts.push('$');
    }
    const matched = input.verification.ok;

    return {
      changedParts,
      createdAt: new Date().toISOString(),
      divergence: input.verification.divergence
        ? {
            actual: input.verification.divergence.actual,
            expected: input.verification.divergence.expected,
            kind: input.verification.divergence.kind,
            message: input.verification.divergence.message,
            path: input.verification.divergence.path
          }
        : null,
      matched,
      nextActionHint: this.nextActionHint(input.verification),
      notes: this.notes(input.verification, unchangedParts, changedParts),
      unchangedParts
    };
  }

  private nextActionHint(verification: PythonVerificationResult): string {
    if (verification.ok) {
      return 'Cross-language output matches. Keep fixture locked and proceed to SDK wrap or host packaging.';
    }

    switch (verification.divergence?.kind) {
      case 'node-error':
        return 'Fix the Node pure baseline first; Python must not chase a broken baseline.';
      case 'python-error':
        return 'Fix the Python scaffold or Python runtime dependency before changing the boundary.';
      case 'no-output':
        return 'Inspect the entry script that emitted no structured output, then rerun verification.';
      case 'input-mismatch':
        return 'Return to fixture construction; Node and Python must consume the same explicit input boundary.';
      case 'intermediate-mismatch':
        return 'Compare intermediate probes before editing final output logic.';
      case 'output-mismatch':
      default:
        return 'Sync Python compute_pure with the Node pure baseline at the reported first divergence.';
    }
  }

  private notes(
    verification: PythonVerificationResult,
    unchangedParts: string[],
    changedParts: string[]
  ): string[] {
    return [
      verification.ok
        ? 'No cross-language divergence was observed.'
        : 'Divergence is reported as the first deterministic mismatch between Node and Python outputs.',
      `Unchanged top-level parts: ${unchangedParts.join(', ') || '(none)'}.`,
      `Changed top-level parts: ${changedParts.join(', ') || '(none)'}.`
    ];
  }
}
