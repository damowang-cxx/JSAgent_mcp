import {
  CRYPTO_ALGORITHM_PATTERNS,
  CRYPTO_LIBRARY_PATTERNS,
  HARDCODED_SECRET_PATTERN,
  PRIVATE_KEY_PATTERN,
  WEAK_CRYPTO_ALGORITHMS
} from './patterns.js';
import type { CryptoDetectionResult, RiskSeverity } from './types.js';

export class CryptoDetector {
  async detect(input: {
    code: string;
    useAI?: boolean;
  }): Promise<CryptoDetectionResult> {
    const code = input.code ?? '';
    const algorithms = CRYPTO_ALGORITHM_PATTERNS
      .map((item) => {
        const matchedBy = this.collectMatches(code, item.pattern, item.name);
        return {
          confidence: this.toConfidence(matchedBy.length),
          matchedBy,
          name: item.name
        };
      })
      .filter((item) => item.matchedBy.length > 0)
      .sort((left, right) => right.confidence - left.confidence || left.name.localeCompare(right.name));

    const libraries = CRYPTO_LIBRARY_PATTERNS
      .filter((item) => item.pattern.test(code))
      .map((item) => item.name)
      .sort();

    const securityIssues = this.detectSecurityIssues(code, algorithms.map((item) => item.name));
    const notes = input.useAI
      ? ['useAI was requested, but Phase 6 intentionally uses deterministic static rules only.']
      : undefined;

    return {
      algorithms,
      libraries: Array.from(new Set(libraries)),
      ...(notes ? { notes } : {}),
      securityIssues
    };
  }

  private collectMatches(code: string, pattern: RegExp, fallback: string): string[] {
    const matches = new Set<string>();
    const source = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);

    for (const match of code.matchAll(source)) {
      const matched = match[0]?.trim();
      if (matched) {
        matches.add(matched.length > 80 ? `${matched.slice(0, 80)}...[truncated]` : matched);
      }
      if (matches.size >= 8) {
        break;
      }
    }

    if (matches.size === 0 && pattern.test(code)) {
      matches.add(fallback);
    }

    return Array.from(matches);
  }

  private toConfidence(matchCount: number): number {
    if (matchCount <= 0) {
      return 0;
    }

    return Math.min(0.95, Number((0.45 + matchCount * 0.12).toFixed(2)));
  }

  private detectSecurityIssues(
    code: string,
    algorithms: readonly string[]
  ): CryptoDetectionResult['securityIssues'] {
    const issues: CryptoDetectionResult['securityIssues'] = [];

    for (const algorithm of algorithms) {
      if (WEAK_CRYPTO_ALGORITHMS.has(algorithm.toLowerCase())) {
        issues.push({
          message: `${algorithm} is weak for security-sensitive hashing or encryption.`,
          severity: algorithm === 'md5' || algorithm === 'sha1' ? 'medium' : 'high',
          type: algorithm === 'md5' || algorithm === 'sha1' ? 'weak-hash' : 'weak-cipher'
        });
      }
    }

    if (/\bMath\.random\s*\(/.test(code)) {
      issues.push({
        message: 'Math.random() was detected; it is not suitable for key, nonce, or signature material.',
        severity: 'medium',
        type: 'insecure-random'
      });
    }

    if (HARDCODED_SECRET_PATTERN.test(code) || PRIVATE_KEY_PATTERN.test(code)) {
      issues.push({
        message: 'Potential hardcoded key material or secret string was detected.',
        severity: 'high',
        type: 'hardcoded-key-material'
      });
    }

    return this.uniqueIssues(issues);
  }

  private uniqueIssues(
    issues: readonly {
      type: string;
      severity: RiskSeverity;
      message: string;
    }[]
  ): CryptoDetectionResult['securityIssues'] {
    const seen = new Set<string>();
    const output: CryptoDetectionResult['securityIssues'] = [];

    for (const issue of issues) {
      const key = `${issue.type}:${issue.severity}:${issue.message}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      output.push(issue);
    }

    return output;
  }
}
