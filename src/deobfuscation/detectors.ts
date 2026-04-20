import type { ObfuscationSignal } from './types.js';

function has(pattern: RegExp, code: string): boolean {
  return pattern.test(code);
}

function evidence(label: string, matched: boolean): string[] {
  return matched ? [label] : [];
}

export function detectObfuscationSignals(code: string): ObfuscationSignal[] {
  const signals: ObfuscationSignal[] = [];
  const minifiedLine = code.split(/\r?\n/).some((line) => line.length > 500);
  const hexNames = Array.from(code.matchAll(/\b_0x[a-f0-9]{3,}\b/gi)).length;
  const escapedStrings = Array.from(code.matchAll(/\\x[0-9a-f]{2}|\\u[0-9a-f]{4}/gi)).length;
  const stringArray =
    /\b(?:var|let|const)\s+(_0x[a-f0-9]{3,})\s*=\s*\[(?:(?:\s*['"`][\s\S]*?['"`]\s*,?)){2,}\]/i.test(code);
  const evalObfuscation = has(/\beval\s*\(\s*(?:String\.fromCharCode|atob|unescape|\w+\s*\()/i, code);

  if (has(/javascript-obfuscator|selfDefending|debugProtection|domainLock|_0x[a-f0-9]{4,}/i, code) || hexNames >= 6) {
    signals.push({
      confidence: Math.min(0.95, 0.45 + hexNames * 0.03),
      evidence: [`hex-like identifiers: ${hexNames}`],
      type: 'javascript-obfuscator-like'
    });
  }

  if (has(/\beval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*(?:r|d)\s*\)/i, code)) {
    signals.push({
      confidence: 0.8,
      evidence: ['Dean Edwards packer wrapper pattern'],
      type: 'packer-like'
    });
  }

  if (evalObfuscation) {
    signals.push({
      confidence: 0.7,
      evidence: ['eval with dynamic string source'],
      type: 'eval-obfuscation'
    });
  }

  if (stringArray) {
    signals.push({
      confidence: 0.75,
      evidence: ['hex-like string array declaration'],
      type: 'string-array style'
    });
  }

  if (minifiedLine || code.length > 0 && code.split(/\r?\n/).length <= 3 && code.length > 1_000) {
    signals.push({
      confidence: 0.55,
      evidence: evidence('very long line or tiny line count for large code', true),
      type: 'minified-like'
    });
  }

  if (has(/\bwhile\s*\(\s*!!\[\]\s*\)|\bswitch\s*\(\s*[^)]*\.split\(['"]\|['"]\)/, code)) {
    signals.push({
      confidence: 0.6,
      evidence: ['while/switch dispatcher pattern'],
      type: 'control-flow-ish'
    });
  }

  if (escapedStrings > 0 || has(/\batob\s*\(\s*['"][A-Za-z0-9+/=]{8,}['"]\s*\)/, code) || has(/['"][0-9a-f]{16,}['"]/i, code)) {
    signals.push({
      confidence: Math.min(0.9, 0.4 + escapedStrings * 0.02),
      evidence: [`escaped/base64/hex string indicators: ${escapedStrings}`],
      type: 'base64/hex/unicode-escaped'
    });
  }

  return signals;
}

export function detectObfuscationTypes(code: string): string[] {
  return detectObfuscationSignals(code).map((signal) => signal.type);
}
