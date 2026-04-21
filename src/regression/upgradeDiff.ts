import type { UpgradeDiffResult } from '../port/types.js';

export function toUpgradeActions(diff: UpgradeDiffResult): {
  nextActions: string[];
  stopIf: string[];
} {
  return {
    nextActions: diff.firstDivergence
      ? [diff.recommendation]
      : ['Keep the current versioned baseline and continue delivery hardening.'],
    stopIf: [
      'Stop if no versioned baseline is registered for this task.',
      ...(diff.firstDivergence ? [] : ['Stop broad rewrites; current upgrade diff does not show a blocking divergence.'])
    ]
  };
}
