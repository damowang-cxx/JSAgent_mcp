import type { NetworkRequestRecord } from '../network/types.js';
import type { CryptoHelperKind, ScenarioIndicator, ScenarioIndicatorType } from './types.js';
import {
  clampScore,
  confidence,
  extractBodyFields,
  extractHeaderFields,
  extractStringLiterals,
  extractUrlFields,
  normalizeUrlPattern,
  requestText,
  targetMatches,
  uniqueStrings,
  unknownToSearchText
} from './normalization.js';

export const SIGNATURE_KEYWORDS = [
  'sign',
  'signature',
  'x-sign',
  'token',
  'access_token',
  'auth',
  'authorization',
  'nonce',
  'verify',
  'challenge',
  'timestamp',
  'ts',
  '_t',
  'hmac',
  'hash',
  'md5',
  'sha',
  'aes',
  'enc',
  'cipher',
  'encrypt',
  'decode',
  'base64'
] as const;

const INDICATOR_PATTERNS: Array<{
  family: string;
  pattern: RegExp;
  type: ScenarioIndicatorType;
  reason: string;
  confidence: number;
}> = [
  { confidence: 0.92, family: 'signature', pattern: /\b(x-?sign|signature|sign)\b/i, reason: 'signature naming indicator', type: 'param' },
  { confidence: 0.88, family: 'token', pattern: /\b(access[_-]?token|token|bearer)\b/i, reason: 'token/auth naming indicator', type: 'param' },
  { confidence: 0.86, family: 'auth', pattern: /\b(auth|authorization)\b/i, reason: 'auth header or auth parameter indicator', type: 'header' },
  { confidence: 0.82, family: 'nonce', pattern: /\b(nonce|verify|challenge|captcha)\b/i, reason: 'nonce/verification/challenge indicator', type: 'param' },
  { confidence: 0.7, family: 'timestamp', pattern: /\b(timestamp|ts|_t|time)\b/i, reason: 'timestamp-like freshness indicator', type: 'param' },
  { confidence: 0.9, family: 'crypto', pattern: /\b(hmac|hash|md5|sha-?1|sha-?256|sha-?512)\b/i, reason: 'hash/HMAC crypto indicator', type: 'crypto' },
  { confidence: 0.86, family: 'cipher', pattern: /\b(aes|rsa|cipher|encrypt|decrypt|enc)\b/i, reason: 'cipher/encryption indicator', type: 'crypto' },
  { confidence: 0.72, family: 'encoding', pattern: /\b(base64|atob|btoa|encode|decode|encodeURIComponent)\b/i, reason: 'encoding helper indicator', type: 'crypto' }
];

export const CANDIDATE_FUNCTION_NAME_PATTERN =
  /(sign|signature|token|auth|nonce|hmac|hash|encrypt|decrypt|cipher|verify|challenge|md5|sha|base64|encode|decode|fingerprint|captcha)/i;

const REQUEST_SINK_PATTERNS: Array<{ label: string; pattern: RegExp; baseScore: number }> = [
  { baseScore: 78, label: 'fetch', pattern: /\bfetch\s*\(/g },
  { baseScore: 76, label: 'XMLHttpRequest', pattern: /\bnew\s+XMLHttpRequest\s*\(|\bXMLHttpRequest\s*\(/g },
  { baseScore: 74, label: 'axios.request', pattern: /\baxios\.request\s*\(/g },
  { baseScore: 73, label: 'axios.post', pattern: /\baxios\.post\s*\(/g },
  { baseScore: 70, label: 'axios.get', pattern: /\baxios\.get\s*\(/g },
  { baseScore: 72, label: '$.ajax', pattern: /\$\s*\.\s*ajax\s*\(/g },
  { baseScore: 66, label: 'sendBeacon', pattern: /\bnavigator\.sendBeacon\s*\(|\bsendBeacon\s*\(/g },
  { baseScore: 50, label: 'WebSocket.send', pattern: /\.send\s*\(/g }
];

export interface RequestScore {
  score: number;
  indicators: string[];
  reasons: string[];
}

export interface CodeSinkHit {
  sink: string;
  file?: string;
  score: number;
  relatedUrls: string[];
  candidateFunctions: string[];
  reasons: string[];
  index: number;
}

export function indicatorsFromText(
  value: unknown,
  input: {
    defaultType?: ScenarioIndicatorType;
    reasonPrefix?: string;
  } = {}
): ScenarioIndicator[] {
  const text = typeof value === 'string' ? value : unknownToSearchText(value);
  const indicators: ScenarioIndicator[] = [];

  for (const entry of INDICATOR_PATTERNS) {
    if (!entry.pattern.test(text)) {
      continue;
    }

    indicators.push({
      confidence: entry.confidence,
      reason: input.reasonPrefix ? `${input.reasonPrefix}: ${entry.reason}` : entry.reason,
      type: input.defaultType ?? entry.type,
      value: entry.family
    });
  }

  return dedupeIndicators(indicators);
}

export function indicatorsFromRequest(request: NetworkRequestRecord): ScenarioIndicator[] {
  const indicators: ScenarioIndicator[] = [];

  for (const indicator of indicatorsFromText(request.url, { defaultType: 'url', reasonPrefix: 'request URL' })) {
    indicators.push(indicator);
  }

  for (const field of [
    ...extractUrlFields(request.url),
    ...extractHeaderFields(request.requestHeaders),
    ...extractBodyFields(request.postData)
  ]) {
    const type = field.source === 'header' ? 'header' : field.source === 'body-field' ? 'body-field' : 'param';
    for (const indicator of indicatorsFromText(`${field.name}\n${field.value ?? ''}`, {
      defaultType: type,
      reasonPrefix: `${field.source} field ${field.name}`
    })) {
      indicators.push({
        ...indicator,
        value: field.name
      });
    }
  }

  return dedupeIndicators(indicators);
}

export function scoreNetworkRequest(
  request: NetworkRequestRecord,
  input: {
    targetUrl?: string;
    correlatedIndicators?: readonly string[];
    fingerprintScore?: number;
    matchedInitiators?: number;
  } = {}
): RequestScore {
  const indicatorHits = indicatorsFromRequest(request);
  const indicatorNames = uniqueStrings([
    ...indicatorHits.map((item) => item.value),
    ...(input.correlatedIndicators ?? [])
  ], 20);
  const method = request.method.toUpperCase();
  const hasWriteMethod = /^(POST|PUT|PATCH|DELETE)$/i.test(method);
  const hasBody = Boolean(request.postData);
  const targetBonus = input.targetUrl && targetMatches(request.url, input.targetUrl) ? 12 : 0;
  const apiPathBonus = /\/api\/|\/v\d+\/|graphql|rpc/i.test(request.url) ? 10 : 0;
  const score = clampScore(
    indicatorNames.length * 12 +
      (hasWriteMethod ? 18 : 0) +
      (hasBody ? 12 : 0) +
      targetBonus +
      apiPathBonus +
      Math.min(20, input.fingerprintScore ?? 0) +
      Math.min(10, (input.matchedInitiators ?? 0) * 4)
  );
  const reasons = [
    indicatorNames.length > 0 ? `matched indicators: ${indicatorNames.join(', ')}` : '',
    hasWriteMethod ? `write-like method ${method}` : '',
    hasBody ? 'request has body data' : '',
    targetBonus > 0 ? 'matches targetUrl filter' : '',
    apiPathBonus > 0 ? 'API-like request path' : '',
    input.fingerprintScore ? `correlation fingerprint score ${input.fingerprintScore}` : '',
    input.matchedInitiators ? `matched initiators ${input.matchedInitiators}` : ''
  ].filter(Boolean);

  return {
    indicators: indicatorNames,
    reasons,
    score
  };
}

export function extractCandidateFunctionNames(code: string, limit = 40): string[] {
  const names = new Set<string>();
  const patterns = [
    /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g,
    /([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?function\s*\(/g,
    /([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?\([^)]*\)\s*=>/g,
    /\bclass\s+([A-Za-z_$][\w$]*)\b/g
  ];

  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) {
      const name = match[1];
      if (name && CANDIDATE_FUNCTION_NAME_PATTERN.test(name)) {
        names.add(name);
      }
      if (names.size >= limit) {
        return Array.from(names).sort();
      }
    }
  }

  return Array.from(names).sort();
}

export function extractAllIdentifierNames(code: string, pattern: RegExp, limit = 80): string[] {
  const names = new Set<string>();
  const identifierPattern = /\b([A-Za-z_$][\w$]*)\b/g;

  for (const match of code.matchAll(identifierPattern)) {
    const name = match[1];
    if (name && pattern.test(name)) {
      names.add(name);
    }
    pattern.lastIndex = 0;

    if (names.size >= limit) {
      break;
    }
  }

  return Array.from(names).sort();
}

export function extractRequestSinksFromCode(code: string, file?: string, targetUrl?: string): CodeSinkHit[] {
  const hits: CodeSinkHit[] = [];

  for (const sinkPattern of REQUEST_SINK_PATTERNS) {
    sinkPattern.pattern.lastIndex = 0;
    for (const match of code.matchAll(sinkPattern.pattern)) {
      const index = match.index ?? 0;
      const windowText = code.slice(Math.max(0, index - 500), Math.min(code.length, index + 900));
      const relatedUrls = extractStringLiterals(windowText, 20)
        .filter((literal) => /^(https?:|wss?:|\/)|api|sign|token|auth|nonce/i.test(literal))
        .filter((literal) => targetMatches(literal, targetUrl))
        .slice(0, 8);
      const functionName = findNearestFunctionName(code, index);
      const indicatorCount = indicatorsFromText(windowText).length;
      const reasons = [
        `matched request sink ${sinkPattern.label}`,
        functionName ? `nearest candidate function ${functionName}` : '',
        relatedUrls.length > 0 ? `near URL literal(s): ${relatedUrls.slice(0, 3).join(', ')}` : '',
        indicatorCount > 0 ? `near signature indicators: ${indicatorCount}` : ''
      ].filter(Boolean);

      hits.push({
        candidateFunctions: functionName ? [functionName] : [],
        file,
        index,
        reasons,
        relatedUrls,
        score: clampScore(sinkPattern.baseScore + relatedUrls.length * 4 + indicatorCount * 5),
        sink: sinkPattern.label
      });
    }
  }

  return hits.sort((left, right) => right.score - left.score || left.sink.localeCompare(right.sink));
}

export function classifyCryptoHelperKind(text: string): CryptoHelperKind {
  if (/\bhmac|HmacSHA/i.test(text)) {
    return 'hmac';
  }
  if (/\b(md5|sha-?1|sha-?256|sha-?512|digest|hash)\b/i.test(text)) {
    return 'hash';
  }
  if (/\baes\b|AES\.(?:encrypt|decrypt)/i.test(text)) {
    return 'aes';
  }
  if (/\brsa\b|JSEncrypt|RSAKey/i.test(text)) {
    return 'rsa';
  }
  if (/\b(base64|atob|btoa)\b/i.test(text)) {
    return 'base64';
  }
  if (/\b(encode|decode|escape|unescape|encodeURIComponent|decodeURIComponent)\b/i.test(text)) {
    return 'encode';
  }

  return 'unknown';
}

export function indicatorsToStrings(indicators: readonly ScenarioIndicator[]): string[] {
  return uniqueStrings(indicators.map((indicator) => indicator.value), 30);
}

export function dedupeIndicators(indicators: readonly ScenarioIndicator[]): ScenarioIndicator[] {
  const byKey = new Map<string, ScenarioIndicator>();

  for (const indicator of indicators) {
    const key = `${indicator.type}:${indicator.value.toLowerCase()}:${indicator.reason}`;
    const existing = byKey.get(key);
    if (!existing || indicator.confidence > existing.confidence) {
      byKey.set(key, {
        ...indicator,
        confidence: confidence(indicator.confidence)
      });
    }
  }

  return Array.from(byKey.values()).sort((left, right) => right.confidence - left.confidence || left.value.localeCompare(right.value));
}

export function requestPatternLabel(request: NetworkRequestRecord): string {
  return `${request.method.toUpperCase()} ${normalizeUrlPattern(request.url)}`;
}

export function hasScenarioSignal(value: unknown): boolean {
  return indicatorsFromText(value).length > 0;
}

export function requestContainsScenarioSignal(request: NetworkRequestRecord): boolean {
  return indicatorsFromText(requestText(request)).length > 0;
}

function findNearestFunctionName(code: string, index: number): string | null {
  const prefix = code.slice(Math.max(0, index - 4_000), index);
  const patterns = [
    /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g,
    /([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?function\s*\(/g
  ];
  let best: { name: string; index: number } | null = null;

  for (const pattern of patterns) {
    for (const match of prefix.matchAll(pattern)) {
      const name = match[1];
      const matchIndex = match.index ?? 0;
      if (name && (!best || matchIndex > best.index)) {
        best = { index: matchIndex, name };
      }
    }
  }

  return best?.name ?? null;
}
