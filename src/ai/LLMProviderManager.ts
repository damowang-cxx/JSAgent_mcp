import type { LlmCompletionRequest, LlmCompletionResult } from './types.js';

interface ProviderConfig {
  providerName?: string;
  baseUrl?: string;
  apiKey?: string;
  modelName?: string;
  timeoutMs: number;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
    text?: string;
  }>;
  error?: {
    message?: string;
  };
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_TOKENS = 900;
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

export class LLMProviderManager {
  private readonly config: ProviderConfig;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.config = {
      apiKey: env.AI_API_KEY,
      baseUrl: env.AI_BASE_URL,
      modelName: env.AI_MODEL,
      providerName: env.AI_PROVIDER,
      timeoutMs: normalizeTimeout(env.AI_TIMEOUT_MS)
    };
  }

  isAvailable(): boolean {
    return Boolean(this.resolveProviderName() && this.resolveBaseUrl() && this.config.apiKey && this.config.modelName);
  }

  getProviderInfo(): { providerAvailable: boolean; providerName?: string; modelName?: string; baseUrl?: string } {
    return {
      baseUrl: this.resolveBaseUrl(),
      modelName: this.config.modelName,
      providerAvailable: this.isAvailable(),
      providerName: this.resolveProviderName()
    };
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const providerName = this.resolveProviderName();
    const baseUrl = this.resolveBaseUrl();
    const modelName = this.config.modelName;
    if (!providerName || !baseUrl || !this.config.apiKey || !modelName) {
      return {
        modelName,
        notes: [
          'AI provider unavailable: configure AI_PROVIDER, AI_API_KEY, and AI_MODEL to enable AI augmentation.',
          'Deterministic artifacts remain the truth source and the workflow can continue without AI.'
        ],
        providerAvailable: false,
        providerName,
        text: ''
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        body: JSON.stringify({
          max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
          messages: request.messages,
          model: modelName,
          temperature: request.temperature ?? 0.2
        }),
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
        method: 'POST',
        signal: controller.signal
      });
      const body = await response.json().catch(() => ({})) as ChatCompletionResponse;
      if (!response.ok) {
        return {
          modelName,
          notes: [
            `AI provider request failed with HTTP ${response.status}: ${body.error?.message ?? response.statusText}`,
            'AI augmentation was skipped; deterministic evidence remains available.'
          ],
          providerAvailable: false,
          providerName,
          text: ''
        };
      }

      const text = body.choices?.[0]?.message?.content ?? body.choices?.[0]?.text ?? '';
      if (!text.trim()) {
        return {
          modelName,
          notes: [
            'AI provider returned an empty response; deterministic fallback explanation was used.'
          ],
          providerAvailable: false,
          providerName,
          text: ''
        };
      }

      return {
        modelName,
        notes: ['AI provider completed a bounded explanation request.'],
        providerAvailable: true,
        providerName,
        text: text.trim()
      };
    } catch (error) {
      return {
        modelName,
        notes: [
          `AI provider unavailable during request: ${error instanceof Error ? error.message : String(error)}`,
          'AI augmentation was skipped; deterministic evidence remains the truth source.'
        ],
        providerAvailable: false,
        providerName,
        text: ''
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private resolveProviderName(): string | undefined {
    const provider = this.config.providerName?.trim();
    if (!provider || provider.toLowerCase() === 'none' || provider.toLowerCase() === 'off') {
      return undefined;
    }
    return provider;
  }

  private resolveBaseUrl(): string | undefined {
    if (this.config.baseUrl?.trim()) {
      return this.config.baseUrl.trim();
    }

    const provider = this.resolveProviderName()?.toLowerCase();
    if (provider === 'openai') {
      return OPENAI_BASE_URL;
    }
    return undefined;
  }
}

function normalizeTimeout(value: string | undefined): number {
  if (!value) {
    return DEFAULT_TIMEOUT_MS;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.max(1_000, Math.min(120_000, parsed));
}
