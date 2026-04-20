import { WEAK_CRYPTO_ALGORITHMS } from './patterns.js';
import type { CryptoDetectionResult, RiskLevel, RiskPanelResult, StaticAnalysisResult } from './types.js';

export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function toRiskLevel(score: number): RiskLevel {
  if (score >= 70) {
    return 'high';
  }

  if (score >= 35) {
    return 'medium';
  }

  return 'low';
}

export function computeStaticQualityScore(input: {
  chars: number;
  lines: number;
  functionCount: number;
  stringLiteralCount: number;
  fileTypeHints: readonly string[];
  likelyModules: readonly string[];
  businessSignalCount: number;
}): number {
  let score = 20;

  if (input.chars >= 200) {
    score += 15;
  }
  if (input.chars >= 2_000) {
    score += 10;
  }
  if (input.lines >= 10) {
    score += 10;
  }
  if (input.functionCount > 0) {
    score += Math.min(15, input.functionCount * 2);
  }
  if (input.stringLiteralCount > 0) {
    score += Math.min(10, input.stringLiteralCount);
  }
  score += Math.min(15, input.fileTypeHints.length * 5);
  score += Math.min(10, input.likelyModules.length * 3);
  score += Math.min(15, input.businessSignalCount * 4);

  const averageLineLength = input.lines > 0 ? input.chars / input.lines : input.chars;
  if (averageLineLength > 800) {
    score -= 20;
  }
  if (input.chars < 80) {
    score -= 25;
  }

  return clampScore(score);
}

export function computeRiskScore(input: {
  staticAnalysis: StaticAnalysisResult;
  crypto: CryptoDetectionResult;
  hookSignalCount: number;
  suspiciousNetworkRequests: number;
}): RiskPanelResult {
  const securityRisks = input.staticAnalysis.security.risks.length;
  const highSeverityRisks = input.staticAnalysis.security.risks.filter((risk) => risk.severity === 'high').length;
  const dangerousAlgorithms = input.crypto.algorithms
    .map((algorithm) => algorithm.name.toLowerCase())
    .filter((name) => WEAK_CRYPTO_ALGORITHMS.has(name));
  const uniqueDangerousAlgorithms = Array.from(new Set(dangerousAlgorithms)).sort();
  const cryptoIssues = input.crypto.securityIssues.length;

  const score = clampScore(
    highSeverityRisks * 18 +
      (securityRisks - highSeverityRisks) * 7 +
      cryptoIssues * 12 +
      uniqueDangerousAlgorithms.length * 10 +
      Math.min(20, input.hookSignalCount * 2) +
      Math.min(20, input.suspiciousNetworkRequests * 4)
  );

  return {
    factors: {
      cryptoAlgorithms: input.crypto.algorithms.length,
      cryptoIssues,
      dangerousAlgorithms: uniqueDangerousAlgorithms,
      highSeverityRisks,
      hookSignals: input.hookSignalCount,
      securityRisks,
      suspiciousNetworkRequests: input.suspiciousNetworkRequests
    },
    level: toRiskLevel(score),
    recommendations: buildRiskRecommendations({
      cryptoIssues,
      dangerousAlgorithms: uniqueDangerousAlgorithms,
      highSeverityRisks,
      hookSignalCount: input.hookSignalCount,
      securityRisks,
      suspiciousNetworkRequests: input.suspiciousNetworkRequests
    }),
    score
  };
}

function buildRiskRecommendations(input: {
  highSeverityRisks: number;
  securityRisks: number;
  cryptoIssues: number;
  dangerousAlgorithms: readonly string[];
  hookSignalCount: number;
  suspiciousNetworkRequests: number;
}): string[] {
  const recommendations: string[] = [];

  if (input.highSeverityRisks > 0) {
    recommendations.push('Review high-severity static risks first, especially dynamic code execution and hardcoded secrets.');
  }
  if (input.dangerousAlgorithms.length > 0) {
    recommendations.push(`Replace or isolate weak crypto algorithms: ${input.dangerousAlgorithms.join(', ')}.`);
  }
  if (input.cryptoIssues > 0) {
    recommendations.push('Inspect key material, randomness sources, and crypto call parameters before rebuilding signatures.');
  }
  if (input.suspiciousNetworkRequests > 0) {
    recommendations.push('Correlate suspicious network requests with initiator stacks and hook records.');
  }
  if (input.hookSignalCount === 0) {
    recommendations.push('Trigger the target user action with fetch/xhr hooks active to collect runtime evidence.');
  }
  if (input.securityRisks === 0 && input.cryptoIssues === 0) {
    recommendations.push('No immediate static high-risk signals were found; prioritize request flow and business signature paths.');
  }

  return recommendations;
}
