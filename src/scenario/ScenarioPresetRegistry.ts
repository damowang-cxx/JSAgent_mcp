import type { ScenarioPreset } from './types.js';

const PRESETS: ScenarioPreset[] = [
  {
    collectHints: {
      includeDynamic: true,
      topN: 8
    },
    description: 'Basic API signature observation with fetch/xhr hooks and top-priority code collection.',
    hookTypes: ['fetch', 'xhr'],
    notes: ['Use when the target request is likely visible after one business action.'],
    presetId: 'api-signature-basic',
    replayHints: ['Trigger the target API action after hooks are active.'],
    scenario: 'api-signature'
  },
  {
    collectHints: {
      includeDynamic: true,
      topN: 12
    },
    description: 'Deeper API signature scan with broader runtime hook hints for dynamic request construction.',
    hookTypes: ['fetch', 'xhr', 'eval', 'timer'],
    notes: ['eval/timer are recipe hints in this phase; supported hook installation remains fetch/xhr unless concrete hooks exist.'],
    presetId: 'api-signature-deep',
    replayHints: ['Replay login/order/search actions that can create sign/token/nonce fields.'],
    scenario: 'api-signature'
  },
  {
    collectHints: {
      topN: 8
    },
    description: 'Trace token/auth/nonce family names across requests, hooks, and code identifiers.',
    hookTypes: ['fetch', 'xhr'],
    notes: ['Token tracing is heuristic and does not claim full data-flow coverage.'],
    presetId: 'token-refresh-basic',
    replayHints: ['Trigger login, refresh, or authenticated API action after hooks are active.'],
    scenario: 'token-family'
  },
  {
    collectHints: {
      includeDynamic: true,
      topN: 12
    },
    description: 'Anti-bot/challenge parameter scan focused on challenge, verify, captcha, nonce, and fingerprint signals.',
    hookTypes: ['fetch', 'xhr', 'eval'],
    notes: ['This is a generic anti-bot parameter preset, not a vendor-specific template.'],
    presetId: 'anti-bot-basic',
    replayHints: ['Trigger page initialization and the protected target action while hooks are active.'],
    scenario: 'anti-bot'
  },
  {
    collectHints: {
      topN: 10
    },
    description: 'Locate crypto, hash, encode, and cipher helpers likely to participate in request parameters.',
    hookTypes: ['fetch', 'xhr'],
    notes: ['Use after suspicious request or candidate helper names appear in code.'],
    presetId: 'crypto-helper-basic',
    replayHints: ['Pair helper review with one request sample if possible.'],
    scenario: 'crypto-helper'
  }
];

export class ScenarioPresetRegistry {
  list(): ScenarioPreset[] {
    return PRESETS.map((preset) => ({
      ...preset,
      collectHints: { ...preset.collectHints },
      hookTypes: [...preset.hookTypes],
      notes: preset.notes ? [...preset.notes] : undefined,
      replayHints: preset.replayHints ? [...preset.replayHints] : undefined
    }));
  }

  get(presetId: string): ScenarioPreset | null {
    return this.list().find((preset) => preset.presetId === presetId) ?? null;
  }
}
