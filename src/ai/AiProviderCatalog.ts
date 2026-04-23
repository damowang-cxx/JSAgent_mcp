import type { LLMProviderManager } from './LLMProviderManager.js';

export interface AiProviderSummary {
  providerId: string;
  available: boolean;
  model?: string;
  mode: 'openai-compatible' | 'anthropic-compatible' | 'unknown';
  notes?: string[];
}

export class AiProviderCatalog {
  constructor(
    private readonly deps: {
      llmProviderManager: LLMProviderManager;
      env?: NodeJS.ProcessEnv;
    }
  ) {}

  listProviders(): AiProviderSummary[] {
    const env = this.deps.env ?? process.env;
    const current = this.deps.llmProviderManager.getProviderInfo();
    const currentMode = current.mode ?? inferMode(current.providerName, current.baseUrl);
    const openAiConfigured = Boolean(env.AI_API_KEY && env.AI_MODEL);
    const anthropicConfigured = Boolean((env.ANTHROPIC_API_KEY || env.AI_API_KEY) && (env.ANTHROPIC_MODEL || env.AI_MODEL));
    const items: AiProviderSummary[] = [
      {
        available: true,
        mode: 'unknown',
        notes: ['Deterministic-only mode is always available and remains the truth path.'],
        providerId: 'deterministic-only'
      }
    ];

    items.push({
      available: currentMode === 'openai-compatible' ? current.providerAvailable : openAiConfigured,
      ...(currentMode === 'openai-compatible' ? (current.modelName ? { model: current.modelName } : {}) : (env.AI_MODEL ? { model: env.AI_MODEL } : {})),
      mode: currentMode === 'anthropic-compatible' ? 'openai-compatible' : currentMode,
      notes: [
        current.providerAvailable && currentMode === 'openai-compatible'
          ? 'Configured through AI_PROVIDER / AI_API_KEY / AI_MODEL and used by the augmentation path when routing permits.'
          : 'OpenAI-compatible route is visible through AI_PROVIDER / AI_API_KEY / AI_MODEL and stays optional.',
        'Provider output is semantic enhancer context, not deterministic truth.'
      ],
      providerId: currentMode === 'openai-compatible' ? (current.providerName ?? 'openai-compatible') : 'openai-compatible'
    });

    const anthropicModel = env.ANTHROPIC_MODEL ?? (env.AI_PROVIDER?.toLowerCase().includes('anthropic') ? env.AI_MODEL : undefined);
    const anthropicAvailable = currentMode === 'anthropic-compatible'
      ? current.providerAvailable
      : Boolean(anthropicConfigured && anthropicModel);
    items.push({
      available: anthropicAvailable,
      ...(currentMode === 'anthropic-compatible'
        ? (current.modelName ? { model: current.modelName } : {})
        : (anthropicModel ? { model: anthropicModel } : {})),
      mode: 'anthropic-compatible',
      notes: [
        anthropicAvailable
          ? 'Anthropic-compatible credentials or active provider route are visible to the substrate catalog.'
          : 'Anthropic-compatible route is listed for routing policy awareness but is not required.',
        'This phase exposes routing-lite metadata and does not turn AI into a truth engine.'
      ],
      providerId: currentMode === 'anthropic-compatible' ? (current.providerName ?? 'anthropic-compatible') : 'anthropic-compatible'
    });

    return items;
  }
}

function inferMode(providerName: string | undefined, baseUrl: string | undefined): AiProviderSummary['mode'] {
  const combined = `${providerName ?? ''} ${baseUrl ?? ''}`.toLowerCase();
  if (combined.includes('anthropic') || combined.includes('claude')) {
    return 'anthropic-compatible';
  }
  if (providerName || baseUrl) {
    return 'openai-compatible';
  }
  return 'unknown';
}
