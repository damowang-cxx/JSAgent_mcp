import type { CryptoDetector } from '../analysis/CryptoDetector.js';
import type { StaticAnalyzer } from '../analysis/StaticAnalyzer.js';
import type { AnalyzeTargetRunner } from '../workflow/AnalyzeTargetRunner.js';
import type { CodeCollector } from '../collector/CodeCollector.js';
import type { Deobfuscator } from '../deobfuscation/Deobfuscator.js';
import {
  CANDIDATE_FUNCTION_NAME_PATTERN,
  classifyCryptoHelperKind,
  extractCandidateFunctionNames
} from './heuristics.js';
import {
  clampScore,
  confidence,
  dedupeBy,
  uniqueStrings
} from './normalization.js';
import type { CryptoHelperKind, CryptoHelperResult } from './types.js';

interface CryptoHelperLocatorDeps {
  analyzeTargetRunner: AnalyzeTargetRunner;
  codeCollector: CodeCollector;
  cryptoDetector: CryptoDetector;
  deobfuscator: Deobfuscator;
  staticAnalyzer: StaticAnalyzer;
}

type HelperEntry = CryptoHelperResult['helpers'][number];

const DEFAULT_TOP_N = 10;
const CRYPTO_CONTEXT_PATTERN = /\b(CryptoJS|crypto\.subtle|subtle\.digest|md5|sha-?1|sha-?256|sha-?512|hmac|AES|RSA|JSEncrypt|base64|atob|btoa|encodeURIComponent|decodeURIComponent|encrypt|decrypt|digest|hash)\b/i;

export class CryptoHelperLocator {
  constructor(private readonly deps: CryptoHelperLocatorDeps) {}

  async locate(options: { topN?: number } = {}): Promise<CryptoHelperResult> {
    const topN = Math.max(1, options.topN ?? DEFAULT_TOP_N);
    const notes: string[] = [];
    const files = this.deps.codeCollector.getTopPriorityFiles(topN).files;

    if (files.length === 0) {
      notes.push('No collected code files are available for crypto helper scanning.');
      return {
        helpers: [],
        libraries: [],
        notes
      };
    }

    const mergedCode = files.map((file) => `/* ${file.url} */\n${file.content}`).join('\n');
    const deobfuscatedCode = await this.deobfuscateMergedCode(mergedCode, notes);
    const [crypto, understanding, deobfuscatedCrypto, deobfuscatedUnderstanding] = await Promise.all([
      this.deps.cryptoDetector.detect({ code: mergedCode }),
      this.deps.staticAnalyzer.understand({ code: mergedCode, focus: 'all' }),
      deobfuscatedCode ? this.deps.cryptoDetector.detect({ code: deobfuscatedCode }) : Promise.resolve(null),
      deobfuscatedCode ? this.deps.staticAnalyzer.understand({ code: deobfuscatedCode, focus: 'all' }) : Promise.resolve(null)
    ]);

    const helpers: HelperEntry[] = [];
    for (const file of files) {
      helpers.push(...this.extractHelpersFromFile(file.url, file.content));
    }
    if (deobfuscatedCode) {
      helpers.push(...this.extractHelpersFromFile('deobfuscated:top-priority', deobfuscatedCode).map((helper) => ({
        ...helper,
        confidence: confidence(helper.confidence + 0.08),
        reasons: ['deobfuscation output helper candidate', ...helper.reasons]
      })));
    }

    for (const name of understanding.structure.candidateFunctions.filter((item) => CANDIDATE_FUNCTION_NAME_PATTERN.test(item))) {
      helpers.push({
        confidence: 0.62,
        kind: classifyCryptoHelperKind(name),
        name,
        reasons: ['static analyzer candidate function name matches crypto/signature keywords']
      });
    }
    for (const name of (deobfuscatedUnderstanding?.structure.candidateFunctions ?? []).filter((item) => CANDIDATE_FUNCTION_NAME_PATTERN.test(item))) {
      helpers.push({
        confidence: 0.7,
        file: 'deobfuscated:top-priority',
        kind: classifyCryptoHelperKind(name),
        name,
        reasons: ['deobfuscated static analyzer candidate function name matches crypto/signature keywords']
      });
    }

    for (const algorithm of [...crypto.algorithms, ...(deobfuscatedCrypto?.algorithms ?? [])]) {
      const kind = this.kindFromAlgorithm(algorithm.name);
      helpers.push({
        confidence: confidence(algorithm.confidence),
        kind,
        name: `crypto:${algorithm.name}`,
        reasons: [
          `crypto detector matched ${algorithm.name}`,
          algorithm.matchedBy.length > 0 ? `matched by ${algorithm.matchedBy.slice(0, 3).join(', ')}` : ''
        ].filter(Boolean)
      });
    }

    const lastAnalyze = this.deps.analyzeTargetRunner.getLastAnalyzeTargetResult();
    if (lastAnalyze?.deobfuscation) {
      notes.push(
        `Last analyze_target deobfuscation summary is available as auxiliary evidence: confidence=${lastAnalyze.deobfuscation.confidence}, readability=${lastAnalyze.deobfuscation.readabilityScore}.`
      );
    }

    const merged = this.mergeHelpers(helpers)
      .sort((left, right) => right.confidence - left.confidence || left.name.localeCompare(right.name))
      .slice(0, topN);

    if (merged.length === 0 && crypto.algorithms.length === 0) {
      notes.push('No crypto helper, algorithm, or encoding helper signal was found in top-priority code.');
    }

    return {
      helpers: merged,
      libraries: uniqueStrings([...crypto.libraries, ...(deobfuscatedCrypto?.libraries ?? [])], 20),
      notes
    };
  }

  private async deobfuscateMergedCode(code: string, notes: string[]): Promise<string | null> {
    const source = code.slice(0, 160_000);
    if (source.trim().length === 0) {
      return null;
    }

    try {
      const result = await this.deps.deobfuscator.deobfuscate({
        aggressive: true,
        code: source,
        explain: false,
        renameVariables: true
      });
      const changed = result.code !== source;
      const changedSteps = result.transformations.filter((step) => step.changed).length;
      notes.push(
        changed
          ? `Consumed deobfuscation output for helper ranking: changedSteps=${changedSteps}, confidence=${result.confidence}.`
          : `Deobfuscation ran for helper ranking but did not materially change top-priority code; confidence=${result.confidence}.`
      );
      return changed ? result.code : null;
    } catch (error) {
      notes.push(`Deobfuscation could not be consumed for helper ranking: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private extractHelpersFromFile(file: string, code: string): HelperEntry[] {
    const helpers: HelperEntry[] = [];
    const names = extractCandidateFunctionNames(code, 80);

    for (const name of names) {
      const context = this.findFunctionContext(code, name);
      if (!CRYPTO_CONTEXT_PATTERN.test(`${name}\n${context}`)) {
        continue;
      }

      const kind = classifyCryptoHelperKind(`${name}\n${context}`);
      const reasons = [
        `function name ${name} matches reverse scenario keywords`,
        kind !== 'unknown' ? `classified as ${kind}` : 'crypto/encoding context found near helper',
        CRYPTO_CONTEXT_PATTERN.test(context) ? 'crypto keyword found in helper body window' : ''
      ].filter(Boolean);

      helpers.push({
        confidence: confidence(0.58 + (kind === 'unknown' ? 0 : 0.2) + (CRYPTO_CONTEXT_PATTERN.test(context) ? 0.12 : 0)),
        file,
        kind,
        name,
        reasons
      });
    }

    const assignmentPattern = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*(?:CryptoJS|md5|sha|hmac|AES|RSA|atob|btoa|encodeURIComponent)/gi;
    for (const match of code.matchAll(assignmentPattern)) {
      const name = match[1];
      if (!name) {
        continue;
      }

      helpers.push({
        confidence: 0.7,
        file,
        kind: classifyCryptoHelperKind(match[0]),
        name,
        reasons: ['assignment directly references crypto or encoding API']
      });
    }

    return helpers;
  }

  private findFunctionContext(code: string, name: string): string {
    const index = code.search(new RegExp(`\\b${escapeRegExp(name)}\\b`));
    if (index < 0) {
      return '';
    }

    return code.slice(index, Math.min(code.length, index + 1_200));
  }

  private mergeHelpers(helpers: readonly HelperEntry[]): HelperEntry[] {
    const byName = new Map<string, HelperEntry>();

    for (const helper of helpers) {
      const key = `${helper.file ?? ''}:${helper.name}`;
      const existing = byName.get(key);
      if (!existing) {
        byName.set(key, {
          ...helper,
          reasons: uniqueStrings(helper.reasons, 10)
        });
        continue;
      }

      byName.set(key, {
        confidence: confidence(Math.max(existing.confidence, helper.confidence) + 0.05),
        file: existing.file ?? helper.file,
        kind: existing.kind !== 'unknown' ? existing.kind : helper.kind,
        name: existing.name,
        reasons: uniqueStrings([...existing.reasons, ...helper.reasons], 10)
      });
    }

    return dedupeBy(Array.from(byName.values()), (helper) => `${helper.file ?? ''}:${helper.name}`)
      .map((helper) => ({
        ...helper,
        confidence: confidence(clampScore(helper.confidence * 100) / 100)
      }));
  }

  private kindFromAlgorithm(name: string): CryptoHelperKind {
    return classifyCryptoHelperKind(name);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
