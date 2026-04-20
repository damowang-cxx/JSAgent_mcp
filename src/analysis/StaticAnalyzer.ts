import {
  CANDIDATE_FUNCTION_NAME_PATTERN,
  DANGEROUS_API_PATTERNS,
  FILE_TYPE_HINT_PATTERNS,
  HARDCODED_SECRET_PATTERN,
  PRIVATE_KEY_PATTERN,
  SIGNAL_PATTERNS,
  SUSPICIOUS_WORD_PATTERN
} from './patterns.js';
import { computeStaticQualityScore } from './scoring.js';
import type { StaticAnalysisFocus, StaticAnalysisResult, StaticRisk } from './types.js';

const MAX_EXTRACTED_ITEMS = 30;

export class StaticAnalyzer {
  async understand(input: {
    code: string;
    focus?: StaticAnalysisFocus;
  }): Promise<StaticAnalysisResult> {
    const code = input.code ?? '';
    const metrics = this.computeMetrics(code);
    const structure = this.analyzeStructure(code);
    const business = this.analyzeBusinessSignals(code);
    const security = this.analyzeSecurity(code);
    const businessSignalCount = Object.values(business).filter(Boolean).length;

    return {
      business,
      metrics,
      qualityScore: computeStaticQualityScore({
        businessSignalCount,
        chars: metrics.chars,
        fileTypeHints: structure.fileTypeHints,
        functionCount: metrics.functionCount,
        likelyModules: structure.likelyModules,
        lines: metrics.lines,
        stringLiteralCount: metrics.stringLiteralCount
      }),
      security,
      structure
    };
  }

  private computeMetrics(code: string): StaticAnalysisResult['metrics'] {
    const normalizedCode = code.trim();
    const lines = normalizedCode.length === 0 ? 0 : normalizedCode.split(/\r?\n/).length;

    return {
      chars: code.length,
      functionCount: this.countMatches(code, /\bfunction\b|=>/g),
      lines,
      stringLiteralCount: this.extractStringLiterals(code).length
    };
  }

  private analyzeStructure(code: string): StaticAnalysisResult['structure'] {
    const fileTypeHints = FILE_TYPE_HINT_PATTERNS
      .filter((item) => item.pattern.test(code))
      .map((item) => item.label ?? item.name);

    const likelyModules: string[] = [];
    if (SIGNAL_PATTERNS.request.some((item) => item.pattern.test(code))) {
      likelyModules.push('network/request');
    }
    if (SIGNAL_PATTERNS.storage.some((item) => item.pattern.test(code))) {
      likelyModules.push('storage/session');
    }
    if (SIGNAL_PATTERNS.crypto.some((item) => item.pattern.test(code))) {
      likelyModules.push('crypto/signature');
    }
    if (SIGNAL_PATTERNS.dom.some((item) => item.pattern.test(code))) {
      likelyModules.push('dom/browser');
    }

    return {
      candidateFunctions: this.extractCandidateFunctions(code),
      exportedSymbols: this.extractExportedSymbols(code),
      fileTypeHints: Array.from(new Set(fileTypeHints)),
      likelyModules
    };
  }

  private analyzeBusinessSignals(code: string): StaticAnalysisResult['business'] {
    return {
      cryptoRelated: SIGNAL_PATTERNS.crypto.some((item) => item.pattern.test(code)),
      domRelated: SIGNAL_PATTERNS.dom.some((item) => item.pattern.test(code)),
      requestRelated: SIGNAL_PATTERNS.request.some((item) => item.pattern.test(code)),
      storageRelated: SIGNAL_PATTERNS.storage.some((item) => item.pattern.test(code))
    };
  }

  private analyzeSecurity(code: string): StaticAnalysisResult['security'] {
    const risks: StaticRisk[] = [];
    const dangerousApis: string[] = [];

    for (const item of DANGEROUS_API_PATTERNS) {
      if (!item.pattern.test(code)) {
        continue;
      }

      dangerousApis.push(item.name);
      risks.push({
        message: item.message ?? `${item.name} was detected.`,
        severity: item.severity ?? 'medium',
        type: item.name
      });
    }

    if (/\b(md5|sha-?1|des|rc4)\b/i.test(code)) {
      risks.push({
        message: 'Weak crypto keywords were detected; verify whether they protect security-sensitive data.',
        severity: 'medium',
        type: 'weak-crypto-keyword'
      });
    }

    if (HARDCODED_SECRET_PATTERN.test(code) || PRIVATE_KEY_PATTERN.test(code)) {
      risks.push({
        message: 'Potential hardcoded token, secret, API key, or private key material was detected.',
        severity: 'high',
        type: 'hardcoded-secret'
      });
    }

    if (/\b(debugger|devtools|anti[-_]?debug|isDebugger)\b/i.test(code)) {
      risks.push({
        message: 'Anti-debug or debugger-related strings were detected.',
        severity: 'medium',
        type: 'anti-debug'
      });
    }

    return {
      dangerousApis: Array.from(new Set(dangerousApis)).sort(),
      risks: this.uniqueRisks(risks),
      suspiciousStrings: this.extractSuspiciousStrings(code)
    };
  }

  private extractExportedSymbols(code: string): string[] {
    const symbols = new Set<string>();
    const patterns = [
      /\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g,
      /\bexports\.([A-Za-z_$][\w$]*)\s*=/g,
      /\bmodule\.exports\.([A-Za-z_$][\w$]*)\s*=/g
    ];

    for (const pattern of patterns) {
      for (const match of code.matchAll(pattern)) {
        if (match[1]) {
          symbols.add(match[1]);
        }
      }
    }

    for (const match of code.matchAll(/\bexport\s*\{([^}]+)\}/g)) {
      const entries = match[1]?.split(',') ?? [];
      for (const entry of entries) {
        const symbol = entry.trim().split(/\s+as\s+/i)[0]?.trim();
        if (symbol && /^[A-Za-z_$][\w$]*$/.test(symbol)) {
          symbols.add(symbol);
        }
      }
    }

    const moduleObject = /\bmodule\.exports\s*=\s*\{([^}]+)\}/g;
    for (const match of code.matchAll(moduleObject)) {
      const entries = match[1]?.split(',') ?? [];
      for (const entry of entries) {
        const symbol = entry.trim().split(':')[0]?.trim();
        if (symbol && /^[A-Za-z_$][\w$]*$/.test(symbol)) {
          symbols.add(symbol);
        }
      }
    }

    return Array.from(symbols).slice(0, MAX_EXTRACTED_ITEMS).sort();
  }

  private extractCandidateFunctions(code: string): string[] {
    const names = new Set<string>();
    const patterns = [
      /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g,
      /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g,
      /([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?function\s*\(/g,
      /([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?\([^)]*\)\s*=>/g
    ];

    for (const pattern of patterns) {
      for (const match of code.matchAll(pattern)) {
        const name = match[1];
        if (name && CANDIDATE_FUNCTION_NAME_PATTERN.test(name)) {
          names.add(name);
        }
      }
    }

    return Array.from(names).slice(0, MAX_EXTRACTED_ITEMS).sort();
  }

  private extractSuspiciousStrings(code: string): string[] {
    const values = new Set<string>();

    for (const literal of this.extractStringLiterals(code)) {
      if (SUSPICIOUS_WORD_PATTERN.test(literal)) {
        values.add(literal.length > 160 ? `${literal.slice(0, 160)}...[truncated]` : literal);
      }
    }

    return Array.from(values).slice(0, MAX_EXTRACTED_ITEMS).sort();
  }

  private extractStringLiterals(code: string): string[] {
    const literals: string[] = [];
    const pattern = /(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g;

    for (const match of code.matchAll(pattern)) {
      if (typeof match[2] === 'string') {
        literals.push(match[2]);
      }
      if (literals.length >= 500) {
        break;
      }
    }

    return literals;
  }

  private countMatches(code: string, pattern: RegExp): number {
    return Array.from(code.matchAll(pattern)).length;
  }

  private uniqueRisks(risks: readonly StaticRisk[]): StaticRisk[] {
    const seen = new Set<string>();
    const output: StaticRisk[] = [];

    for (const risk of risks) {
      const key = `${risk.type}:${risk.severity}:${risk.message}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      output.push(risk);
    }

    return output;
  }
}
