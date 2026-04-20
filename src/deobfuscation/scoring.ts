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
  transformations: readonly TransformationRecord[],
  obfuscationTypes: readonly string[]
): number {
  const executed = transformations.filter((item) => item.executed && item.success).length;
  const changedSteps = transformations.filter((item) => item.changed && item.success).length;
  const failures = transformations.filter((item) => item.executed && !item.success).length;
  const changed = changedSteps > 0 && originalCode !== finalCode;
  const readabilityGain = calculateReadabilityScore(finalCode) - calculateReadabilityScore(originalCode);
  const detectedObfuscation = obfuscationTypes.length > 0 && !obfuscationTypes.includes('none-detected');
  const matchingTransformBonus = calculateMatchingTransformBonus(transformations, obfuscationTypes);
  const base = detectedObfuscation ? 0.22 : 0.08;
  const score =
    base +
    Math.min(0.36, changedSteps * 0.12) +
    Math.min(0.08, executed * 0.01) +
    Math.max(0, readabilityGain) * 0.006 +
    matchingTransformBonus -
    failures * 0.05 -
    (changed ? 0 : 0.12);

  return Number(Math.max(0.05, Math.min(0.95, score)).toFixed(2));
}

function calculateMatchingTransformBonus(
  transformations: readonly TransformationRecord[],
  obfuscationTypes: readonly string[]
): number {
  const changedTypes = new Set(transformations.filter((item) => item.changed && item.success).map((item) => item.type));
  let bonus = 0;

  if (obfuscationTypes.includes('string-array style') && changedTypes.has('simplify:string-array')) {
    bonus += 0.12;
  }
  if (obfuscationTypes.includes('eval-obfuscation') && changedTypes.has('unpack:from-char-code')) {
    bonus += 0.12;
  }
  if (obfuscationTypes.includes('packer-like') && changedTypes.has('unpack:packer-like')) {
    bonus += 0.1;
  }
  if (obfuscationTypes.includes('base64/hex/unicode-escaped') && (changedTypes.has('decode:escaped-strings') || changedTypes.has('decode:base64-hex'))) {
    bonus += 0.1;
  }
  if (obfuscationTypes.includes('javascript-obfuscator-like') && changedTypes.has('rename:hex-identifiers')) {
    bonus += 0.06;
  }

  return Math.min(0.22, bonus);
}
