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
    const currentMode = inferMode(current.providerName, current.baseUrl);
    const items: AiProviderSummary[] = [
      {
        available: true,
        mode: 'unknown',
        notes: ['Deterministic-only mode is always available and remains the truth path.'],
        providerId: 'deterministic-only'
      }
    ];

    items.push({
      available: current.providerAvailable && currentMode !== 'anthropic-compatible',
      ...(current.modelName ? { model: current.modelName } : {}),
      mode: currentMode === 'anthropic-compatible' ? 'openai-compatible' : currentMode,
      notes: [
        current.providerAvailable
          ? 'Configured through AI_PROVIDER / AI_API_KEY / AI_MODEL and used by the existing augmentation path.'
          : 'OpenAI-compatible route is unavailable unless AI_PROVIDER, AI_API_KEY, and AI_MODEL are configured.',
        'Provider output is semantic enhancer context, not deterministic truth.'
      ],
      providerId: current.providerName ?? 'openai-compatible'
    });

    const anthropicModel = env.ANTHROPIC_MODEL ?? (env.AI_PROVIDER?.toLowerCase().includes('anthropic') ? env.AI_MODEL : undefined);
    const anthropicAvailable = Boolean(
      (env.ANTHROPIC_API_KEY || (env.AI_PROVIDER?.toLowerCase().includes('anthropic') && env.AI_API_KEY))
      && anthropicModel
    );
    items.push({
      available: anthropicAvailable,
      ...(anthropicModel ? { model: anthropicModel } : {}),
      mode: 'anthropic-compatible',
      notes: [
        anthropicAvailable
          ? 'Anthropic-compatible credentials are visible to the substrate catalog.'
          : 'Anthropic-compatible route is listed for routing policy awareness but is not required.',
        'This phase exposes routing-lite metadata and does not turn AI into a truth engine.'
      ],
      providerId: 'anthropic-compatible'
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
