import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import type { CodeCollector } from '../collector/CodeCollector.js';
import type { HookManager } from '../hook/HookManager.js';
import type { NetworkCollector } from '../network/NetworkCollector.js';
import {
  extractAllIdentifierNames
} from './heuristics.js';
import {
  asString,
  dedupeBy,
  extractBodyFields,
  extractHeaderFields,
  extractUrlFields,
  targetMatches,
  toRecord,
  uniqueStrings
} from './normalization.js';
import type { TokenFamilyTraceResult } from './types.js';

interface TokenScenarioAnalyzerDeps {
  browserSession: BrowserSessionManager;
  codeCollector: CodeCollector;
  hookManager: HookManager;
  networkCollector: NetworkCollector;
}

type TokenMember = TokenFamilyTraceResult['members'][number];
type TokenTransformation = TokenFamilyTraceResult['transformations'][number];
type TokenRequestBinding = TokenFamilyTraceResult['requestBindings'][number];

const DEFAULT_FAMILIES = ['token', 'auth', 'nonce', 'verify', 'challenge', 'sign'] as const;

export class TokenScenarioAnalyzer {
  constructor(private readonly deps: TokenScenarioAnalyzerDeps) {}

  async trace(options: {
    targetUrl?: string;
    familyName?: string;
    candidateNames?: string[];
  } = {}): Promise<TokenFamilyTraceResult> {
    const notes: string[] = [];
    const requests = await this.readRequests(options.targetUrl, notes);
    const hookRecords = await this.readHookRecords(notes);
    const code = this.readMergedCode(notes);
    const familyName = options.familyName?.trim() || this.inferFamilyName(requests, hookRecords, code, options.candidateNames);
    const namePattern = this.buildFamilyPattern(familyName, options.candidateNames);
    const members: TokenMember[] = [];
    const requestBindings: TokenRequestBinding[] = [];

    for (const request of requests) {
      const fields = [
        ...extractUrlFields(request.url),
        ...extractHeaderFields(request.requestHeaders),
        ...extractBodyFields(request.postData)
      ];

      for (const field of fields) {
        if (!namePattern.test(field.name)) {
          namePattern.lastIndex = 0;
          continue;
        }
        namePattern.lastIndex = 0;

        members.push({
          confidence: field.source === 'header' ? 0.82 : 0.88,
          firstSeen: request.startedAt,
          name: field.name,
          source: 'request'
        });
        requestBindings.push({
          method: request.method.toUpperCase(),
          param: field.name,
          url: request.url
        });
      }
    }

    for (const record of hookRecords) {
      for (const key of this.collectRelatedKeys(record, namePattern)) {
        members.push({
          confidence: 0.72,
          firstSeen: this.readRecordTimestamp(record),
          name: key,
          source: 'hook'
        });
      }
    }

    const codeNames = extractAllIdentifierNames(code, namePattern, 120);
    for (const name of codeNames) {
      members.push({
        confidence: name.toLowerCase() === familyName.toLowerCase() ? 0.74 : 0.64,
        name,
        source: 'code'
      });
    }

    const transformations = this.extractTransformations(code, familyName, codeNames, namePattern);
    const mergedMembers = dedupeBy(
      members.sort((left, right) => right.confidence - left.confidence || left.name.localeCompare(right.name)),
      (member) => `${member.source}:${member.name.toLowerCase()}`
    ).slice(0, 80);

    if (mergedMembers.length === 0) {
      notes.push(`No ${familyName} family members were located from request, hook, or code evidence.`);
    }
    if (requestBindings.length === 0) {
      notes.push(`No ${familyName} request parameter/header/body binding was found yet.`);
    }
    if (transformations.length === 0) {
      notes.push('No simple from -> to token-family transformation was inferred; this is heuristic and not a full data-flow result.');
    }

    return {
      familyName,
      members: mergedMembers,
      notes,
      requestBindings: dedupeBy(requestBindings, (binding) => `${binding.method}:${binding.url}:${binding.param}`).slice(0, 80),
      transformations
    };
  }

  private async readRequests(targetUrl: string | undefined, notes: string[]) {
    try {
      const snapshot = await this.deps.networkCollector.listRequests({ limit: 300 });
      return snapshot.requests.filter((request) => targetMatches(request.url, targetUrl));
    } catch (error) {
      notes.push(`Unable to read network requests for token family trace: ${this.toMessage(error)}`);
      return [];
    }
  }

  private async readHookRecords(notes: string[]): Promise<Record<string, unknown>[]> {
    try {
      const page = await this.deps.browserSession.getSelectedPage();
      const hookData = await this.deps.hookManager.getHookData(page);
      return Object.values(hookData.records).flat();
    } catch (error) {
      notes.push(`Unable to read hook records for token family trace: ${this.toMessage(error)}`);
      return [];
    }
  }

  private readMergedCode(notes: string[]): string {
    try {
      const files = this.deps.codeCollector.getTopPriorityFiles(12).files;
      if (files.length === 0) {
        notes.push('No collected code files are available for token family code scanning.');
      }
      return files.map((file) => `/* ${file.url} */\n${file.content}`).join('\n');
    } catch (error) {
      notes.push(`Unable to read collected code for token family trace: ${this.toMessage(error)}`);
      return '';
    }
  }

  private inferFamilyName(
    requests: Awaited<ReturnType<TokenScenarioAnalyzer['readRequests']>>,
    hookRecords: readonly Record<string, unknown>[],
    code: string,
    candidateNames: readonly string[] | undefined
  ): string {
    const text = [
      ...requests.flatMap((request) => [
        request.url,
        request.postData ?? '',
        ...Object.keys(request.requestHeaders ?? {})
      ]),
      ...hookRecords.map((record) => JSON.stringify(record).slice(0, 2_000)),
      code.slice(0, 200_000),
      ...(candidateNames ?? [])
    ].join('\n').toLowerCase();

    const scored = DEFAULT_FAMILIES.map((family) => ({
      family,
      score: (text.match(new RegExp(`\\b${family}\\b`, 'g')) ?? []).length
    })).sort((left, right) => right.score - left.score);

    return scored[0]?.score ? scored[0].family : 'token';
  }

  private buildFamilyPattern(familyName: string, candidateNames: readonly string[] | undefined): RegExp {
    const escaped = uniqueStrings([familyName, ...(candidateNames ?? []), ...this.defaultFamilyAliases(familyName)], 30)
      .map(escapeRegExp)
      .join('|');
    return new RegExp(`(?:${escaped})`, 'i');
  }

  private defaultFamilyAliases(familyName: string): string[] {
    switch (familyName.toLowerCase()) {
      case 'auth':
        return ['authorization', 'bearer', 'accessToken', 'access_token'];
      case 'nonce':
        return ['nonceStr', 'nonce_str', 'random', 'salt'];
      case 'verify':
        return ['verification', 'captcha', 'challenge'];
      case 'challenge':
        return ['challengeResp', 'challenge_response', 'verify'];
      case 'sign':
        return ['signature', 'xSign', 'x-sign', 'signToken'];
      case 'token':
      default:
        return ['accessToken', 'access_token', 'refreshToken', 'refresh_token', 'signToken'];
    }
  }

  private collectRelatedKeys(value: unknown, pattern: RegExp, depth = 0): string[] {
    if (depth > 4) {
      return [];
    }

    if (Array.isArray(value)) {
      return value.flatMap((item) => this.collectRelatedKeys(item, pattern, depth + 1));
    }

    const record = toRecord(value);
    if (!record) {
      return [];
    }

    const output: string[] = [];
    for (const [key, item] of Object.entries(record).slice(0, 80)) {
      if (pattern.test(key)) {
        output.push(key);
      }
      pattern.lastIndex = 0;
      output.push(...this.collectRelatedKeys(item, pattern, depth + 1));
    }

    return uniqueStrings(output, 60);
  }

  private extractTransformations(
    code: string,
    familyName: string,
    codeNames: readonly string[],
    pattern: RegExp
  ): TokenTransformation[] {
    const transformations: TokenTransformation[] = [];
    const lowerFamily = familyName.toLowerCase();

    for (const name of codeNames) {
      const lowerName = name.toLowerCase();
      if (lowerName !== lowerFamily) {
        transformations.push({
          confidence: lowerName.includes(lowerFamily) ? 0.58 : 0.45,
          from: familyName,
          to: name,
          via: 'name-family heuristic'
        });
      }
    }

    const assignmentPattern = /\b([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\b/g;
    for (const match of code.matchAll(assignmentPattern)) {
      const to = match[1];
      const from = match[2];
      if (!to || !from || to === from) {
        continue;
      }
      if (!pattern.test(to) || !pattern.test(from)) {
        pattern.lastIndex = 0;
        continue;
      }
      pattern.lastIndex = 0;
      transformations.push({
        confidence: 0.62,
        from,
        to,
        via: 'assignment'
      });
    }

    const callPattern = /\b([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*\(\s*([A-Za-z_$][\w$]*)/g;
    for (const match of code.matchAll(callPattern)) {
      const to = match[1];
      const via = match[2];
      const from = match[3];
      if (!to || !from || !via) {
        continue;
      }
      if (!pattern.test(to) || !pattern.test(from)) {
        pattern.lastIndex = 0;
        continue;
      }
      pattern.lastIndex = 0;
      transformations.push({
        confidence: 0.68,
        from,
        to,
        via
      });
    }

    return dedupeBy(
      transformations.sort((left, right) => right.confidence - left.confidence || left.from.localeCompare(right.from)),
      (item) => `${item.from}:${item.to}:${item.via ?? ''}`
    ).slice(0, 60);
  }

  private readRecordTimestamp(record: Record<string, unknown>): string | undefined {
    const timestamp = asString(record.timestamp) ?? asString(record.ts);
    if (timestamp) {
      return timestamp;
    }

    return undefined;
  }

  private toMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
