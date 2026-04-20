import type { DivergenceRecord } from '../rebuild/types.js';
import type { DivergenceProgress } from './types.js';

const EXPLAINABILITY_RANK: Record<DivergenceRecord['kind'], number> = {
  'no-output': 0,
  'runtime-error': 1,
  'missing-global': 2,
  'missing-property': 3,
  'type-mismatch': 4,
  'value-mismatch': 5
};

export function compareDivergenceProgress(
  previous: DivergenceRecord | null | undefined,
  current: DivergenceRecord | null | undefined
): DivergenceProgress {
  const resolved = current == null;
  const unchanged = sameDivergence(previous, current);
  const movedForward = !unchanged && (resolved || rank(current) > rank(previous));
  const worsened = !resolved && !unchanged && rank(current) < rank(previous);

  return {
    current: current ?? null,
    movedForward,
    previous: previous ?? null,
    resolved,
    unchanged,
    worsened
  };
}

function rank(divergence: DivergenceRecord | null | undefined): number {
  if (!divergence) {
    return 6;
  }

  return EXPLAINABILITY_RANK[divergence.kind] ?? 1;
}

function sameDivergence(
  previous: DivergenceRecord | null | undefined,
  current: DivergenceRecord | null | undefined
): boolean {
  if (!previous && !current) {
    return true;
  }
  if (!previous || !current) {
    return false;
  }

  return previous.kind === current.kind && previous.path === current.path && previous.message === current.message;
}
