import { Buffer } from 'node:buffer';

import type { TransformResult } from './types.js';

function safeStringLiteral(value: string): string {
  return JSON.stringify(value);
}

function isMostlyPrintable(value: string): boolean {
  if (value.length === 0) {
    return false;
  }

  const printable = Array.from(value).filter((char) => /[\t\r\n\x20-\x7e]/.test(char)).length;
  return printable / value.length > 0.85;
}

function decodeJsEscapes(value: string): string {
  return value
    .replace(/\\x([0-9a-f]{2})/gi, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\u([0-9a-f]{4})/gi, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

function decodeStringLiteral(raw: string): string | null {
  const quote = raw[0];
  if (!quote || !['"', "'", '`'].includes(quote) || raw[raw.length - 1] !== quote) {
    return null;
  }

  const inner = raw.slice(1, -1);
  return decodeJsEscapes(inner);
}

export function decodeEvalStringFromCharCode(code: string): TransformResult {
  let decoded = 0;
  const nextCode = code.replace(/\beval\s*\(\s*String\.fromCharCode\s*\(([\d\s,]+)\)\s*\)\s*;?/g, (_match, numbers: string) => {
    const chars = numbers
      .split(',')
      .map((item) => Number.parseInt(item.trim(), 10))
      .filter((value) => Number.isFinite(value) && value >= 0 && value <= 0xffff)
      .map((value) => String.fromCharCode(value))
      .join('');

    if (!chars || !isMostlyPrintable(chars)) {
      return _match;
    }

    decoded += 1;
    return `/* decoded eval(String.fromCharCode) */\n${chars}`;
  });

  return {
    changed: decoded > 0,
    code: nextCode,
    detail: { decoded }
  };
}

export function decodeEscapedStrings(code: string): TransformResult {
  let decoded = 0;
  const stringLiteralPattern = /(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g;
  const nextCode = code.replace(stringLiteralPattern, (match) => {
    if (!/(?:\\x[0-9a-f]{2}|\\u[0-9a-f]{4})/i.test(match)) {
      return match;
    }

    const value = decodeStringLiteral(match);
    if (value === null || !isMostlyPrintable(value)) {
      return match;
    }

    decoded += 1;
    return safeStringLiteral(value);
  });

  return {
    changed: decoded > 0,
    code: nextCode,
    detail: { decoded }
  };
}

export function decodeBase64AndHexLiterals(code: string): TransformResult {
  let decodedBase64 = 0;
  let decodedHex = 0;

  let nextCode = code.replace(/\batob\s*\(\s*(['"])([A-Za-z0-9+/=]{8,})\1\s*\)/g, (match, _quote: string, value: string) => {
    try {
      const decoded = Buffer.from(value, 'base64').toString('utf8');
      if (!isMostlyPrintable(decoded)) {
        return match;
      }

      decodedBase64 += 1;
      return safeStringLiteral(decoded);
    } catch {
      return match;
    }
  });

  nextCode = nextCode.replace(/(['"])([0-9a-f]{16,})\1/gi, (match, _quote: string, value: string) => {
    if (value.length % 2 !== 0) {
      return match;
    }

    try {
      const decoded = Buffer.from(value, 'hex').toString('utf8');
      if (!isMostlyPrintable(decoded) || decoded === value) {
        return match;
      }

      decodedHex += 1;
      return safeStringLiteral(decoded);
    } catch {
      return match;
    }
  });

  return {
    changed: decodedBase64 + decodedHex > 0,
    code: nextCode,
    detail: { decodedBase64, decodedHex }
  };
}

export function extractPackerPayload(code: string): TransformResult {
  const match = /\beval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*(?:r|d)\s*\)\s*\{[\s\S]{0,4000}?\}\s*\(\s*(['"`])([\s\S]*?)\1\s*,/i.exec(code);
  if (!match?.[2]) {
    return {
      changed: false,
      code,
      detail: { extracted: false }
    };
  }

  const payload = decodeJsEscapes(match[2]);
  if (!payload || payload.length < 20) {
    return {
      changed: false,
      code,
      detail: { extracted: false }
    };
  }

  return {
    changed: true,
    code: `/* extracted packer-like payload; full symbol unpack is not implemented */\n${payload}`,
    detail: { extracted: true, payloadLength: payload.length },
    warnings: ['Packer-like wrapper was extracted but not fully symbol-unpacked.']
  };
}

export function simplifyConstantsAndSyntax(code: string): TransformResult {
  let replacements = 0;
  const replace = (input: string, pattern: RegExp, value: string): string =>
    input.replace(pattern, () => {
      replacements += 1;
      return value;
    });

  let nextCode = code;
  nextCode = replace(nextCode, /!!\[\]/g, 'true');
  nextCode = replace(nextCode, /!\[\]/g, 'false');
  nextCode = replace(nextCode, /!0\b/g, 'true');
  nextCode = replace(nextCode, /!1\b/g, 'false');
  nextCode = replace(nextCode, /\bvoid\s+0\b/g, 'undefined');
  nextCode = nextCode.replace(/\(\s*([A-Za-z_$][\w$]*|true|false|null|undefined|\d+)\s*\)/g, (_match, value: string) => {
    replacements += 1;
    return value;
  });

  return {
    changed: replacements > 0,
    code: nextCode,
    detail: { replacements }
  };
}

export function foldStringConcats(code: string): TransformResult {
  let folded = 0;
  let nextCode = code;
  const pattern = /(['"])((?:\\.|(?!\1)[\s\S])*?)\1\s*\+\s*(['"])((?:\\.|(?!\3)[\s\S])*?)\3/g;

  for (let index = 0; index < 5; index += 1) {
    let changedThisPass = false;
    nextCode = nextCode.replace(pattern, (match, leftQuote: string, leftValue: string, _rightQuote: string, rightValue: string) => {
      if (leftQuote !== _rightQuote) {
        return match;
      }

      folded += 1;
      changedThisPass = true;
      return safeStringLiteral(decodeJsEscapes(leftValue) + decodeJsEscapes(rightValue));
    });

    if (!changedThisPass) {
      break;
    }
  }

  return {
    changed: folded > 0,
    code: nextCode,
    detail: { folded }
  };
}

export function eliminateSimpleDeadBranches(code: string): TransformResult {
  let eliminated = 0;
  let nextCode = code.replace(/\bif\s*\(\s*false\s*\)\s*\{([\s\S]{0,500}?)\}\s*else\s*\{([\s\S]{0,1000}?)\}/g, (_match, _dead: string, live: string) => {
    eliminated += 1;
    return live;
  });

  nextCode = nextCode.replace(/\bif\s*\(\s*true\s*\)\s*\{([\s\S]{0,1000}?)\}\s*else\s*\{([\s\S]{0,500}?)\}/g, (_match, live: string) => {
    eliminated += 1;
    return live;
  });

  return {
    changed: eliminated > 0,
    code: nextCode,
    detail: { eliminated }
  };
}

export function simplifyStringArrayAccess(code: string): TransformResult {
  const arrayPattern = /\b(?:var|let|const)\s+(_0x[a-f0-9]{3,})\s*=\s*\[((?:(?:\s*['"`](?:\\.|(?!['"`])[\s\S])*?['"`]\s*,?)+))\]\s*;?/gi;
  const arrays = new Map<string, string[]>();
  let nextCode = code;
  let arraysFound = 0;
  let replacements = 0;

  for (const match of code.matchAll(arrayPattern)) {
    const name = match[1];
    const rawValues = match[2] ?? '';
    if (!name) {
      continue;
    }

    const values: string[] = [];
    for (const literal of rawValues.matchAll(/(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g)) {
      values.push(decodeJsEscapes(literal[2] ?? ''));
    }

    if (values.length > 1) {
      arrays.set(name, values);
      arraysFound += 1;
    }
  }

  for (const [name, values] of arrays) {
    const accessPattern = new RegExp(`\\b${name}\\s*\\[\\s*(0x[0-9a-f]+|\\d+)\\s*\\]`, 'gi');
    nextCode = nextCode.replace(accessPattern, (match, rawIndex: string) => {
      const index = rawIndex.toLowerCase().startsWith('0x') ? Number.parseInt(rawIndex, 16) : Number.parseInt(rawIndex, 10);
      const value = values[index];
      if (value === undefined) {
        return match;
      }

      replacements += 1;
      return safeStringLiteral(value);
    });
  }

  return {
    changed: replacements > 0,
    code: nextCode,
    detail: { arraysFound, replacements }
  };
}

export function renameHexVariables(code: string): TransformResult {
  const protectedNames = new Set(['_0x', '_0x0']);
  const names = Array.from(new Set(Array.from(code.matchAll(/\b_0x[a-f0-9]{3,}\b/gi)).map((match) => match[0])))
    .filter((name) => !protectedNames.has(name))
    .sort((left, right) => left.localeCompare(right));
  const mapping = new Map<string, string>();

  names.forEach((name, index) => {
    mapping.set(name, `decoded_${index + 1}`);
  });

  let nextCode = code;
  for (const [from, to] of mapping) {
    nextCode = nextCode.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
  }

  return {
    changed: mapping.size > 0,
    code: nextCode,
    detail: {
      renamed: mapping.size,
      mapping: Object.fromEntries(Array.from(mapping.entries()).slice(0, 50))
    }
  };
}

export function cleanupReadability(code: string): TransformResult {
  let nextCode = code
    .replace(/;{2,}/g, ';')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');

  if (!nextCode.includes('\n') && nextCode.length > 300) {
    nextCode = nextCode
      .replace(/;/g, ';\n')
      .replace(/\{/g, '{\n')
      .replace(/\}/g, '\n}\n')
      .replace(/\n{3,}/g, '\n\n');
  }

  return {
    changed: nextCode !== code,
    code: nextCode,
    detail: { charsBefore: code.length, charsAfter: nextCode.length }
  };
}
