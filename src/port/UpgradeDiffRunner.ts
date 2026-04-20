import type { UpgradeDiffResult } from './types.js';

type UpgradeLayer = NonNullable<UpgradeDiffResult['firstDivergence']>['layer'];

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function collectParts(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value as Record<string, unknown>).sort();
}

function stringifyForSignals(...values: unknown[]): string {
  return values
    .map((value) => {
      try {
        return typeof value === 'string' ? value : JSON.stringify(value);
      } catch {
        return String(value);
      }
    })
    .join('\n')
    .toLowerCase();
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
      description: options.targetDescription,
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
    description?: string;
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
        layer: this.inferLayer({
          actual: input.newNode,
          defaultLayer: 'env-state',
          description: input.description,
          expected: input.newRuntime,
          relation: 'runtime-vs-node'
        }),
        message: 'Runtime side and Node pure side diverge; inspect the inferred boundary layer before changing Python.'
      };
    }

    if (input.newNode !== undefined && input.newPython !== undefined && !sameJson(input.newNode, input.newPython)) {
      return {
        actual: input.newPython,
        expected: input.newNode,
        layer: this.inferLayer({
          actual: input.newPython,
          defaultLayer: 'final-output',
          description: input.description,
          expected: input.newNode,
          relation: 'node-vs-python'
        }),
        message: 'Port side diverges from Node pure baseline; fix Python against the shared fixture before SDK wrapping.'
      };
    }

    if (input.oldNode !== undefined && input.newNode !== undefined && !sameJson(input.oldNode, input.newNode)) {
      return {
        actual: input.newNode,
        expected: input.oldNode,
        layer: this.inferLayer({
          actual: input.newNode,
          defaultLayer: 'final-output',
          description: input.description,
          expected: input.oldNode,
          relation: 'node-upgrade'
        }),
        message: 'Node pure output changed between old and new samples.'
      };
    }

    if (input.oldPython !== undefined && input.newPython !== undefined && !sameJson(input.oldPython, input.newPython)) {
      return {
        actual: input.newPython,
        expected: input.oldPython,
        layer: this.inferLayer({
          actual: input.newPython,
          defaultLayer: 'final-output',
          description: input.description,
          expected: input.oldPython,
          relation: 'python-upgrade'
        }),
        message: 'Python pure output changed between old and new samples.'
      };
    }

    return null;
  }

  private inferLayer(input: {
    actual: unknown;
    defaultLayer: UpgradeLayer;
    description?: string;
    expected: unknown;
    relation: 'runtime-vs-node' | 'node-vs-python' | 'node-upgrade' | 'python-upgrade';
  }): UpgradeLayer {
    const haystack = stringifyForSignals(input.description, input.expected, input.actual);

    if (/\b(token|sign|signature|nonce|vk|tail|clt|gsd?|checksum)\b/.test(haystack)) {
      return 'token-family';
    }

    if (/\b(crypto|hmac|sha1|sha256|sha512|md5|aes|rsa|pbkdf2|subtle|digest|encrypt|decrypt)\b/.test(haystack)) {
      return 'crypto-helper';
    }

    if (/\b(fetch|xhr|ajax|axios|request|method|url|headers|postdata|body|endpoint)\b/.test(haystack)) {
      return 'request';
    }

    if (/\b(hook|hookid|hook-output|timeline|watchpoint|initiator)\b/.test(haystack)) {
      return 'hook-output';
    }

    if (/\b(window|document|navigator|useragent|location|cookie|localstorage|sessionstorage|performance|timezone|screen|env)\b/.test(haystack)) {
      return 'env-state';
    }

    if (input.relation === 'runtime-vs-node') {
      return 'env-state';
    }

    return input.defaultLayer;
  }

  private recommend(divergence: UpgradeDiffResult['firstDivergence']): string {
    if (!divergence) {
      return 'Keep the fixture and baseline; no upgrade-specific action is required from the supplied samples.';
    }

    switch (divergence.layer) {
      case 'request':
        return 'Recheck request fixture fields first: URL pattern, method, headers, and body shape.';
      case 'hook-output':
        return 'Re-sample hook output or correlate the hook timeline before changing pure code.';
      case 'token-family':
        return 'Focus on token/sign/nonce family inputs and intermediate outputs before broad rewrites.';
      case 'crypto-helper':
        return 'Inspect crypto helper parity and key/material handling before patching environment state.';
      case 'env-state':
        return 'Refine environment-state boundary or rebuild fixture before changing Python port code.';
      case 'final-output':
        break;
    }

    if (/Python pure output diverges|Port side diverges/i.test(divergence.message)) {
      return 'Sync Python pure with the Node baseline before SDK packaging.';
    }

    return 'Analyze the changed final output with the same fixture before broad environment patching.';
  }
}
