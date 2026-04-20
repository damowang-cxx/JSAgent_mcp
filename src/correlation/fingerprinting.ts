import type { CorrelatedFlow, CorrelationPriorityTarget, RequestFingerprint } from './types.js';

export function normalizeUrlPattern(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl, 'http://relative.local');
    const origin = rawUrl.startsWith('/') ? '' : parsed.origin;
    const normalizedPath = parsed.pathname
      .replace(/\/\d{2,}(?=\/|$)/g, '/:num')
      .replace(/\/[a-f0-9]{8,}(?=\/|$)/gi, '/:hex');
    const queryKeys = Array.from(parsed.searchParams.keys()).sort();
    const queryPattern = queryKeys.length > 0 ? `?${queryKeys.join('&')}` : '';
    return `${origin}${normalizedPath || '/'}${queryPattern}`;
  } catch {
    return rawUrl
      .split('?')[0]
      .replace(/\/\d{2,}(?=\/|$)/g, '/:num')
      .replace(/\/[a-f0-9]{8,}(?=\/|$)/gi, '/:hex');
  }
}

export function isSuspiciousUrlOrMethod(url: string, methods: readonly string[]): boolean {
  return /sign|signature|token|auth|api|nonce|encrypt|captcha/i.test(url) || methods.some((method) => /^(POST|PUT|PATCH|DELETE)$/i.test(method));
}

export function buildRequestFingerprints(
  flows: readonly CorrelatedFlow[],
  maxFingerprints: number
): RequestFingerprint[] {
  const buckets = new Map<string, {
    urlPattern: string;
    methods: Set<string>;
    flowCount: number;
    totalEvents: number;
    signatureIndicators: Set<string>;
    suspiciousScore: number;
    sampleUrls: Set<string>;
    matchedInitiators: number;
  }>();

  for (const flow of flows) {
    const urlPattern = normalizeUrlPattern(flow.url);
    const existing = buckets.get(urlPattern);
    const methodScore = /^(POST|PUT|PATCH|DELETE)$/i.test(flow.method) ? 20 : 0;
    const indicatorScore = flow.signatureIndicators.length * 12;
    const initiatorScore = flow.matchedInitiators > 0 ? 10 : 0;
    const eventScore = Math.min(25, flow.eventCount * 4);
    const urlScore = /sign|signature|token|auth|api|nonce|encrypt|captcha/i.test(urlPattern) ? 25 : 0;
    const flowScore = Math.min(100, methodScore + indicatorScore + initiatorScore + eventScore + urlScore);

    if (existing) {
      existing.methods.add(flow.method);
      existing.flowCount += 1;
      existing.totalEvents += flow.eventCount;
      existing.suspiciousScore += flowScore;
      existing.sampleUrls.add(flow.url);
      existing.matchedInitiators += flow.matchedInitiators;
      for (const indicator of flow.signatureIndicators) {
        existing.signatureIndicators.add(indicator);
      }
      continue;
    }

    buckets.set(urlPattern, {
      flowCount: 1,
      matchedInitiators: flow.matchedInitiators,
      methods: new Set([flow.method]),
      sampleUrls: new Set([flow.url]),
      signatureIndicators: new Set(flow.signatureIndicators),
      suspiciousScore: flowScore,
      totalEvents: flow.eventCount,
      urlPattern
    });
  }

  return Array.from(buckets.values())
    .sort((left, right) => right.suspiciousScore - left.suspiciousScore || right.totalEvents - left.totalEvents)
    .slice(0, maxFingerprints)
    .map((bucket) => {
      const methods = Array.from(bucket.methods).sort();
      return {
        fingerprint: `${methods.join('+')} ${bucket.urlPattern}`,
        flowCount: bucket.flowCount,
        matchedInitiators: bucket.matchedInitiators,
        methods,
        sampleUrls: Array.from(bucket.sampleUrls).slice(0, 3),
        signatureIndicators: Array.from(bucket.signatureIndicators).sort(),
        suspiciousScore: Math.min(100, bucket.suspiciousScore),
        totalEvents: bucket.totalEvents,
        urlPattern: bucket.urlPattern
      };
    });
}

export function buildPriorityTargets(input: {
  requestFingerprints: readonly RequestFingerprint[];
  candidateFunctions?: readonly string[];
  cryptoAlgorithms?: readonly string[];
  requestSinks?: readonly string[];
}): CorrelationPriorityTarget[] {
  const targets: CorrelationPriorityTarget[] = [];

  for (const fingerprint of input.requestFingerprints.slice(0, 8)) {
    const writeLike = fingerprint.methods.some((method) => /^(POST|PUT|PATCH|DELETE)$/i.test(method));
    targets.push({
      priorityScore: Math.min(100, fingerprint.suspiciousScore + (writeLike ? 8 : 0)),
      reasons: [
        `request fingerprint score ${fingerprint.suspiciousScore}`,
        writeLike ? `write-like methods: ${fingerprint.methods.join(', ')}` : '',
        fingerprint.signatureIndicators.length > 0 ? `signature indicators: ${fingerprint.signatureIndicators.join(', ')}` : '',
        fingerprint.matchedInitiators > 0 ? `matched initiators: ${fingerprint.matchedInitiators}` : ''
      ].filter(Boolean),
      target: fingerprint.urlPattern,
      type: 'network'
    });
  }

  for (const functionName of (input.candidateFunctions ?? []).slice(0, 8)) {
    targets.push({
      priorityScore: 65 + Math.min(15, (input.requestSinks?.length ?? 0) * 3),
      reasons: [
        'candidate function name matches sign/token/hash/auth/crypto keywords',
        input.requestSinks && input.requestSinks.length > 0 ? `request sinks observed: ${input.requestSinks.slice(0, 3).join(', ')}` : ''
      ].filter(Boolean),
      target: functionName,
      type: 'function'
    });
  }

  for (const algorithm of (input.cryptoAlgorithms ?? []).slice(0, 8)) {
    targets.push({
      priorityScore: /md5|sha1|des|rc4/i.test(algorithm) ? 70 : 55,
      reasons: [/md5|sha1|des|rc4/i.test(algorithm) ? 'weak or legacy crypto algorithm' : 'crypto concept observed in collected code'],
      target: algorithm,
      type: 'crypto'
    });
  }

  return targets
    .sort((left, right) => right.priorityScore - left.priorityScore || left.target.localeCompare(right.target))
    .slice(0, 20);
}
