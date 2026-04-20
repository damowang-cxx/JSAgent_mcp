import { computeRiskScore } from './scoring.js';
import type { CryptoDetectionResult, RiskPanelResult, StaticAnalysisResult } from './types.js';

export class RiskScorer {
  async score(input: {
    staticAnalysis: StaticAnalysisResult;
    crypto: CryptoDetectionResult;
    hookSignalCount?: number;
    suspiciousNetworkRequests?: number;
  }): Promise<RiskPanelResult> {
    return computeRiskScore({
      crypto: input.crypto,
      hookSignalCount: input.hookSignalCount ?? 0,
      staticAnalysis: input.staticAnalysis,
      suspiciousNetworkRequests: input.suspiciousNetworkRequests ?? 0
    });
  }
}
