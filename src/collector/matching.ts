import { AppError } from '../core/errors.js';

export function compileCollectorPattern(pattern: string, code = 'INVALID_REGEX'): RegExp {
  try {
    return new RegExp(pattern, 'i');
  } catch (error) {
    throw new AppError(code, `Invalid regular expression: ${error instanceof Error ? error.message : String(error)}`, {
      pattern
    });
  }
}

export function isLikelyJavaScriptResponse(
  url: string | undefined,
  mimeType: string | undefined,
  resourceType: string | undefined
): boolean {
  if (resourceType === 'Script') {
    return true;
  }

  if (typeof mimeType === 'string' && /javascript|ecmascript|x-javascript/i.test(mimeType)) {
    return true;
  }

  return isLikelyJavaScriptUrl(url);
}

export function isLikelyJavaScriptUrl(url: string | undefined): boolean {
  if (typeof url !== 'string' || url.length === 0) {
    return false;
  }

  return /(?:\.m?js)(?:$|[?#])/i.test(url);
}
