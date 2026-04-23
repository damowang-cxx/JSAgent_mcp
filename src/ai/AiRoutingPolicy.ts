export type AiRoutingDefaultMode =
  | 'deterministic-only'
  | 'prefer-openai-compatible'
  | 'prefer-anthropic-compatible'
  | 'auto';

export interface AiRoutingPolicyState {
  defaultMode: AiRoutingDefaultMode;
  modeOverrides?: Record<string, string>;
  notes?: string[];
}

export class AiRoutingPolicy {
  private state: AiRoutingPolicyState = {
    defaultMode: 'deterministic-only',
    modeOverrides: {},
    notes: ['deterministic-only is the default route; AI remains optional semantic enhancement.']
  };

  get(): AiRoutingPolicyState {
    return clonePolicy(this.state);
  }

  set(input: {
    defaultMode: AiRoutingDefaultMode;
    modeOverrides?: Record<string, string>;
  }): AiRoutingPolicyState {
    this.state = {
      defaultMode: input.defaultMode,
      modeOverrides: { ...(input.modeOverrides ?? {}) },
      notes: [
        'Routing policy is advisory substrate metadata.',
        'Deterministic artifacts remain the truth source even when an AI-compatible provider is preferred.'
      ]
    };
    return this.get();
  }
}

function clonePolicy(policy: AiRoutingPolicyState): AiRoutingPolicyState {
  return {
    defaultMode: policy.defaultMode,
    modeOverrides: { ...(policy.modeOverrides ?? {}) },
    notes: policy.notes ? [...policy.notes] : undefined
  };
}
