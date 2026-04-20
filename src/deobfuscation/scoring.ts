import type { TransformationRecord } from './types.js';

export function calculateReadabilityScore(code: string): number {
  if (code.trim().length === 0) {
    return 0;
  }

  const lines = code.split(/\r?\n/);
  const averageLineLength = code.length / Math.max(1, lines.length);
  const hexIdentifierCount = Array.from(code.matchAll(/\b_0x[a-f0-9]{3,}\b/gi)).length;
  const escapedCount = Array.from(code.matchAll(/\\x[0-9a-f]{2}|\\u[0-9a-f]{4}/gi)).length;
  const keywordCount = Array.from(code.matchAll(/\b(function|const|let|var|return|if|for|while|class|import|export)\b/g)).length;

  let score = 60;
  score += Math.min(20, keywordCount);
  score -= Math.min(25, Math.max(0, averageLineLength - 160) / 8);
  score -= Math.min(25, hexIdentifierCount * 1.5);
  score -= Math.min(15, escapedCount * 0.5);

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function calculateConfidence(
  originalCode: string,
  finalCode: string,
  transformations: readonly TransformationRecord[]
): number {
  const successes = transformations.filter((item) => item.success).length;
  const failures = transformations.filter((item) => !item.success).length;
  const changed = originalCode !== finalCode;
  const readabilityGain = calculateReadabilityScore(finalCode) - calculateReadabilityScore(originalCode);
  const base = changed ? 0.35 : 0.2;
  const score = base + successes * 0.08 + Math.max(0, readabilityGain) * 0.004 - failures * 0.04;

  return Number(Math.max(0.05, Math.min(0.95, score)).toFixed(2));
}
