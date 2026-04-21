import type { CapturePreset } from './types.js';

const PRESETS: CapturePreset[] = [
  {
    collectHints: {
      includeDynamic: true,
      topN: 8
    },
    defaultCaptureWindowMs: 4_000,
    defaultHooks: ['fetch', 'xhr'],
    description: 'Basic replay capture for API signature requests with fetch/xhr hooks and dynamic script collection.',
    notes: ['Actions are supplied by the caller; this preset does not embed site-specific selectors.'],
    presetId: 'api-signature-replay-basic',
    scenario: 'api-signature'
  },
  {
    collectHints: {
      topN: 8
    },
    defaultCaptureWindowMs: 5_000,
    defaultHooks: ['fetch', 'xhr'],
    description: 'Replay capture for token refresh/auth/nonce chains with request and hook evidence windows.',
    notes: ['Use with actions that trigger login, refresh, or authenticated API traffic.'],
    presetId: 'token-refresh-replay-basic',
    scenario: 'token-family'
  },
  {
    collectHints: {
      includeDynamic: true,
      topN: 12
    },
    defaultCaptureWindowMs: 6_000,
    defaultHooks: ['fetch', 'xhr'],
    description: 'Replay capture for anti-bot challenge parameters such as verify, captcha, fingerprint, and nonce fields.',
    notes: ['Capture at least two samples before trusting challenge stability.'],
    presetId: 'anti-bot-challenge-replay',
    scenario: 'anti-bot'
  },
  {
    collectHints: {
      topN: 10
    },
    defaultCaptureWindowMs: 3_000,
    defaultHooks: ['fetch', 'xhr'],
    description: 'Helper-first replay probe for crypto/hash/encode helpers and request-bound outputs.',
    notes: ['Pair this with extract_helper_boundary after a helper candidate is identified.'],
    presetId: 'crypto-helper-probe-basic',
    scenario: 'crypto-helper'
  },
  {
    collectHints: {
      includeDynamic: true,
      topN: 8
    },
    defaultCaptureWindowMs: 4_000,
    defaultHooks: ['fetch', 'xhr'],
    description: 'Single manual action replay entry used by replay_target_action.',
    notes: ['Convenience preset; no site-specific actions are embedded.'],
    presetId: 'manual-single-action',
    scenario: 'api-signature'
  }
];

export class CapturePresetRegistry {
  list(): CapturePreset[] {
    return PRESETS.map((preset) => ({
      ...preset,
      collectHints: preset.collectHints ? { ...preset.collectHints } : undefined,
      defaultHooks: [...preset.defaultHooks],
      notes: preset.notes ? [...preset.notes] : undefined
    }));
  }

  get(presetId: string): CapturePreset | null {
    return this.list().find((preset) => preset.presetId === presetId) ?? null;
  }
}
