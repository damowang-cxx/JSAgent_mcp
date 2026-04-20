import type { RiskSeverity } from './types.js';

export interface NamedPattern {
  name: string;
  pattern: RegExp;
  label?: string;
  severity?: RiskSeverity;
  message?: string;
}

export const SIGNAL_PATTERNS = {
  request: [
    { name: 'fetch', pattern: /\bfetch\s*\(/i },
    { name: 'XMLHttpRequest', pattern: /\bXMLHttpRequest\b/i },
    { name: 'axios', pattern: /\baxios\s*\./i },
    { name: 'ajax', pattern: /\bajax\s*\(/i },
    { name: 'request-url', pattern: /\b(url|endpoint|api|request|headers?)\b/i }
  ],
  storage: [
    { name: 'localStorage', pattern: /\blocalStorage\b/i },
    { name: 'sessionStorage', pattern: /\bsessionStorage\b/i },
    { name: 'indexedDB', pattern: /\bindexedDB\b/i },
    { name: 'cookie', pattern: /\bdocument\.cookie\b/i }
  ],
  crypto: [
    { name: 'crypto.subtle', pattern: /\bcrypto\.subtle\b/i },
    { name: 'hash', pattern: /\b(md5|sha-?1|sha-?256|sha-?512|hash|digest)\b/i },
    { name: 'cipher', pattern: /\b(aes|rsa|hmac|pbkdf2|encrypt|decrypt)\b/i },
    { name: 'base64', pattern: /\b(atob|btoa|base64)\b/i }
  ],
  dom: [
    { name: 'querySelector', pattern: /\bquerySelector(All)?\s*\(/i },
    { name: 'addEventListener', pattern: /\baddEventListener\s*\(/i },
    { name: 'document', pattern: /\bdocument\./i },
    { name: 'window-location', pattern: /\b(window\.)?location\b/i }
  ]
} satisfies Record<string, readonly NamedPattern[]>;

export const FILE_TYPE_HINT_PATTERNS: readonly NamedPattern[] = [
  { name: 'esm', label: 'ESM-like', pattern: /\b(import\s+[\w*{]|export\s+(?:default|const|let|var|function|class|\{))/ },
  { name: 'commonjs', label: 'CommonJS-like', pattern: /\b(require\s*\(|module\.exports|exports\.[A-Za-z_$])/ },
  { name: 'webpack', label: 'webpack-like bundle', pattern: /\b(__webpack_require__|webpackJsonp|webpackChunk|__webpack_modules__)\b/ },
  { name: 'umd', label: 'UMD-like wrapper', pattern: /\bdefine\.amd\b|typeof\s+define\s*===\s*['"]function['"]|factory\s*\(\s*root/ },
  { name: 'minified', label: 'minified-like', pattern: /[A-Za-z_$][\w$]{1,2}=[A-Za-z_$][\w$]{1,2}\.[A-Za-z_$]|;[A-Za-z_$][\w$]{0,2}\(/ }
];

export const CANDIDATE_FUNCTION_NAME_PATTERN =
  /(sign|token|encrypt|decrypt|hash|auth|nonce|hmac|md5|sha|crypto|fingerprint|captcha|verify|signature)/i;

export const SUSPICIOUS_WORD_PATTERN =
  /(sign|signature|token|auth|bearer|nonce|secret|apikey|api_key|access[_-]?key|private[_-]?key|password|crypto|encrypt|decrypt|hmac|md5|sha1|debugger|devtools)/i;

export const DANGEROUS_API_PATTERNS: readonly NamedPattern[] = [
  {
    message: 'Dynamic eval can execute attacker-controlled code and makes static reasoning harder.',
    name: 'eval',
    pattern: /\beval\s*\(/,
    severity: 'high'
  },
  {
    message: 'Function constructor is equivalent to dynamic code evaluation.',
    name: 'Function constructor',
    pattern: /\bnew\s+Function\s*\(|\bFunction\s*\(/,
    severity: 'high'
  },
  {
    message: 'document.write can rewrite active documents and is frequently unsafe.',
    name: 'document.write',
    pattern: /\bdocument\.write\s*\(/,
    severity: 'medium'
  },
  {
    message: 'innerHTML assignment should be reviewed for DOM injection risk.',
    name: 'innerHTML assignment',
    pattern: /\.innerHTML\s*=/,
    severity: 'medium'
  },
  {
    message: 'Debugger or anti-debug keywords indicate runtime inspection resistance.',
    name: 'debugger / anti-debug',
    pattern: /\bdebugger\b|devtools|anti[-_]?debug|isDebugger|console\.clear\s*\(/i,
    severity: 'medium'
  }
];

export const CRYPTO_ALGORITHM_PATTERNS: readonly NamedPattern[] = [
  { name: 'md5', pattern: /\bmd5\b|MD5\s*\(/i },
  { name: 'sha1', pattern: /\bsha-?1\b|SHA1\s*\(/i },
  { name: 'sha256', pattern: /\bsha-?256\b|SHA256\s*\(/i },
  { name: 'hmac', pattern: /\bhmac\b|HmacSHA\w+\s*\(/i },
  { name: 'aes', pattern: /\baes\b|AES\.(encrypt|decrypt)\s*\(/i },
  { name: 'rsa', pattern: /\brsa\b|JSEncrypt|RSAKey/i },
  { name: 'base64', pattern: /\bbase64\b|\batob\s*\(|\bbtoa\s*\(/i },
  { name: 'crypto.subtle', pattern: /\bcrypto\.subtle\b|\bsubtle\.digest\b/i },
  { name: 'pbkdf2', pattern: /\bpbkdf2\b|PBKDF2\s*\(/i },
  { name: 'des', pattern: /\bdes\b|TripleDES|DES\.(encrypt|decrypt)\s*\(/i },
  { name: 'rc4', pattern: /\brc4\b|RC4\.(encrypt|decrypt)\s*\(/i }
];

export const CRYPTO_LIBRARY_PATTERNS: readonly NamedPattern[] = [
  { name: 'crypto-js', pattern: /\bCryptoJS\b|crypto-js/i },
  { name: 'jsrsasign', pattern: /\bjsrsasign\b|KJUR\.crypto|RSAKey/i },
  { name: 'forge', pattern: /\bforge\b|node-forge/i },
  { name: 'sjcl', pattern: /\bsjcl\b/i }
];

export const WEAK_CRYPTO_ALGORITHMS = new Set(['md5', 'sha1', 'des', 'rc4']);

export const HARDCODED_SECRET_PATTERN =
  /\b(secret|token|apiKey|api_key|accessKey|access_key|privateKey|private_key|password|passwd|bearer)\b\s*[:=]\s*['"][^'"]{8,}['"]/i;

export const PRIVATE_KEY_PATTERN = /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/i;
