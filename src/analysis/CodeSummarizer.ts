import type { CodeFile } from '../collector/types.js';
import { SIGNAL_PATTERNS, SUSPICIOUS_WORD_PATTERN } from './patterns.js';
import type { CodeSummary } from './types.js';

const STOP_WORDS = new Set([
  'and',
  'are',
  'async',
  'await',
  'case',
  'catch',
  'class',
  'const',
  'else',
  'false',
  'for',
  'from',
  'function',
  'if',
  'import',
  'let',
  'new',
  'null',
  'return',
  'this',
  'true',
  'try',
  'var',
  'void',
  'while',
  'with'
]);

interface FileSignals {
  request: number;
  storage: number;
  crypto: number;
  dom: number;
  suspicious: string[];
}

export class CodeSummarizer {
  async summarizeFile(file: CodeFile): Promise<CodeSummary> {
    const signals = this.getSignals(file.content);
    const keywords = this.extractKeywords(file.content);
    const signalLabels = this.toSignalLabels(signals);
    const highlights = [
      `${file.type} file ${file.url} has ${file.size} characters.`,
      signalLabels.length > 0 ? `Detected ${signalLabels.join(', ')} signals.` : 'No dominant request/storage/crypto/dom signal was detected.',
      keywords.length > 0 ? `Top keywords: ${keywords.slice(0, 8).join(', ')}.` : 'No strong keywords were extracted.'
    ];

    if (signals.suspicious.length > 0) {
      highlights.push(`Suspicious indicators: ${signals.suspicious.slice(0, 8).join(', ')}.`);
    }

    return {
      highlights,
      keywords,
      mode: 'single',
      overview: this.buildSingleOverview(signals),
      suspiciousIndicators: signals.suspicious
    };
  }

  async summarizeBatch(files: CodeFile[]): Promise<CodeSummary> {
    const aggregate = this.aggregate(files);
    const keywords = this.extractKeywords(files.map((file) => file.content).join('\n'));
    const requestHeavy = this.rankFiles(files, 'request').slice(0, 5);
    const cryptoHeavy = this.rankFiles(files, 'crypto').slice(0, 5);
    const highlights = [
      `Batch contains ${files.length} file(s) with ${this.totalSize(files)} characters.`,
      `Signals: request=${aggregate.request}, storage=${aggregate.storage}, crypto=${aggregate.crypto}, dom=${aggregate.dom}.`
    ];

    if (requestHeavy.length > 0) {
      highlights.push(`Request-heavy files: ${requestHeavy.map((item) => item.file.url).join(', ')}.`);
    }
    if (cryptoHeavy.length > 0) {
      highlights.push(`Crypto-heavy files: ${cryptoHeavy.map((item) => item.file.url).join(', ')}.`);
    }

    return {
      fileCount: files.length,
      highlights,
      keywords,
      mode: 'batch',
      overview: this.buildBatchOverview(files, aggregate),
      suspiciousIndicators: aggregate.suspicious
    };
  }

  async summarizeProject(files: CodeFile[]): Promise<CodeSummary> {
    const aggregate = this.aggregate(files);
    const keywords = this.extractKeywords(files.map((file) => file.content).join('\n'));
    const mainBundleCandidates = [...files]
      .sort((left, right) => right.size - left.size)
      .slice(0, 5);
    const requestHeavy = this.rankFiles(files, 'request').slice(0, 5);
    const cryptoHeavy = this.rankFiles(files, 'crypto').slice(0, 5);
    const likelyEntryFiles = files
      .filter((file) => /main|index|app|entry|bundle|runtime/i.test(file.url))
      .slice(0, 5);

    const highlights = [
      `Project view covers ${files.length} file(s) and ${this.totalSize(files)} characters.`,
      mainBundleCandidates.length > 0 ? `Main bundle candidates: ${mainBundleCandidates.map((file) => file.url).join(', ')}.` : 'No main bundle candidate was found.',
      requestHeavy.length > 0 ? `Request-heavy files: ${requestHeavy.map((item) => item.file.url).join(', ')}.` : 'No request-heavy file was found.',
      cryptoHeavy.length > 0 ? `Crypto-heavy files: ${cryptoHeavy.map((item) => item.file.url).join(', ')}.` : 'No crypto-heavy file was found.',
      likelyEntryFiles.length > 0 ? `Likely entry files: ${likelyEntryFiles.map((file) => file.url).join(', ')}.` : 'No likely entry file was found from URL names.'
    ];

    return {
      fileCount: files.length,
      highlights,
      keywords,
      mode: 'project',
      overview: this.buildProjectOverview(files, aggregate),
      suspiciousIndicators: aggregate.suspicious
    };
  }

  private buildSingleOverview(signals: FileSignals): string {
    const labels = this.toSignalLabels(signals);
    if (labels.length === 0) {
      return 'This file does not expose a strong request, storage, crypto, or DOM role from static keywords.';
    }

    if (signals.request > 0 && signals.crypto > 0) {
      return 'This file appears to participate in request signing or protected API traffic because request and crypto signals both appear.';
    }

    if (signals.request > 0) {
      return 'This file appears request-oriented and likely builds or sends network calls.';
    }

    if (signals.crypto > 0) {
      return 'This file appears crypto-oriented and may contain hashing, signing, encryption, or encoding helpers.';
    }

    if (signals.storage > 0) {
      return 'This file appears to read or write browser storage or cookies.';
    }

    return 'This file appears browser/DOM-oriented and likely coordinates page behavior.';
  }

  private buildBatchOverview(files: readonly CodeFile[], signals: FileSignals): string {
    if (files.length === 0) {
      return 'No files were provided for batch summarization.';
    }

    const labels = this.toSignalLabels(signals);
    return labels.length > 0
      ? `The batch is primarily characterized by ${labels.join(', ')} signals across ${files.length} file(s).`
      : `The batch contains ${files.length} file(s), but no dominant static signal was detected.`;
  }

  private buildProjectOverview(files: readonly CodeFile[], signals: FileSignals): string {
    if (files.length === 0) {
      return 'No files were provided for project summarization.';
    }

    if (signals.request > 0 && signals.crypto > 0) {
      return 'The project view suggests a reverse target with protected API calls: request construction and crypto/signature helpers both appear.';
    }

    if (signals.request > 0) {
      return 'The project view is network-heavy and should be investigated through request fingerprints and initiator stacks.';
    }

    return 'The project view is mostly structural at this stage; collect more dynamic code or trigger target actions for stronger signals.';
  }

  private aggregate(files: readonly CodeFile[]): FileSignals {
    const aggregate: FileSignals = {
      crypto: 0,
      dom: 0,
      request: 0,
      storage: 0,
      suspicious: []
    };
    const suspicious = new Set<string>();

    for (const file of files) {
      const signals = this.getSignals(file.content);
      aggregate.crypto += signals.crypto;
      aggregate.dom += signals.dom;
      aggregate.request += signals.request;
      aggregate.storage += signals.storage;
      for (const item of signals.suspicious) {
        suspicious.add(item);
      }
    }

    aggregate.suspicious = Array.from(suspicious).slice(0, 30).sort();
    return aggregate;
  }

  private getSignals(code: string): FileSignals {
    const suspicious = new Set<string>();

    for (const literal of this.extractSuspiciousLiterals(code)) {
      suspicious.add(literal);
    }

    return {
      crypto: this.countSignalGroup(code, 'crypto'),
      dom: this.countSignalGroup(code, 'dom'),
      request: this.countSignalGroup(code, 'request'),
      storage: this.countSignalGroup(code, 'storage'),
      suspicious: Array.from(suspicious).slice(0, 30).sort()
    };
  }

  private countSignalGroup(code: string, group: keyof typeof SIGNAL_PATTERNS): number {
    return SIGNAL_PATTERNS[group].reduce((count, item) => count + (item.pattern.test(code) ? 1 : 0), 0);
  }

  private toSignalLabels(signals: FileSignals): string[] {
    const labels: string[] = [];
    if (signals.request > 0) {
      labels.push('request');
    }
    if (signals.storage > 0) {
      labels.push('storage');
    }
    if (signals.crypto > 0) {
      labels.push('crypto');
    }
    if (signals.dom > 0) {
      labels.push('dom');
    }
    return labels;
  }

  private rankFiles(files: readonly CodeFile[], group: keyof typeof SIGNAL_PATTERNS): Array<{ file: CodeFile; score: number }> {
    return files
      .map((file) => ({
        file,
        score: this.countSignalGroup(file.content, group)
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || right.file.size - left.file.size);
  }

  private extractKeywords(code: string): string[] {
    const counts = new Map<string, number>();

    for (const match of code.matchAll(/\b[A-Za-z_$][\w$]{2,}\b/g)) {
      const word = match[0].toLowerCase();
      if (STOP_WORDS.has(word) || /^\d+$/.test(word)) {
        continue;
      }

      counts.set(word, (counts.get(word) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 20)
      .map(([word]) => word);
  }

  private extractSuspiciousLiterals(code: string): string[] {
    const output = new Set<string>();
    const stringPattern = /(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g;

    for (const match of code.matchAll(stringPattern)) {
      const value = match[2] ?? '';
      if (!SUSPICIOUS_WORD_PATTERN.test(value)) {
        continue;
      }

      output.add(value.length > 120 ? `${value.slice(0, 120)}...[truncated]` : value);
      if (output.size >= 30) {
        break;
      }
    }

    return Array.from(output);
  }

  private totalSize(files: readonly CodeFile[]): number {
    return files.reduce((total, file) => total + file.size, 0);
  }
}
