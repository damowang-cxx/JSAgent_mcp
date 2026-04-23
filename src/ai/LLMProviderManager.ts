import type { LlmChatMessage, LlmCompletionRequest, LlmCompletionResult } from './types.js';

type ProviderMode = 'openai-compatible' | 'anthropic-compatible';

interface ProviderRoute {
  providerName: string;
  mode: ProviderMode;
  baseUrl: string;
  apiKey: string;
  modelName: string;
  timeoutMs: number;
}

interface ProviderConfig {
  providerName?: string;
  baseUrl?: string;
  apiKey?: string;
  modelName?: string;
  anthropicBaseUrl?: string;
  anthropicApiKey?: string;
  anthropicModelName?: string;
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

interface AnthropicMessagesResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  error?: {
    message?: string;
  };
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_TOKENS = 900;
const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';

export class LLMProviderManager {
  private readonly config: ProviderConfig;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.config = {
      anthropicApiKey: env.ANTHROPIC_API_KEY,
      anthropicBaseUrl: env.ANTHROPIC_BASE_URL,
      anthropicModelName: env.ANTHROPIC_MODEL,
      apiKey: env.AI_API_KEY,
      baseUrl: env.AI_BASE_URL,
      modelName: env.AI_MODEL,
      providerName: env.AI_PROVIDER,
      timeoutMs: normalizeTimeout(env.AI_TIMEOUT_MS)
    };
  }

  isAvailable(): boolean {
    return Boolean(this.resolveRoute());
  }

  getProviderInfo(): {
    providerAvailable: boolean;
    providerName?: string;
    modelName?: string;
    baseUrl?: string;
    mode?: ProviderMode;
  } {
    const route = this.resolveRoute();
    return {
      baseUrl: route?.baseUrl,
      mode: route?.mode,
      modelName: route?.modelName,
      providerAvailable: Boolean(route),
      providerName: route?.providerName
    };
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const route = this.resolveRoute();
    if (!route) {
      return {
        modelName: undefined,
        notes: [
          'AI provider unavailable: configure AI_PROVIDER / AI_API_KEY / AI_MODEL for openai-compatible routes, or ANTHROPIC_API_KEY / ANTHROPIC_MODEL for anthropic-compatible routes.',
          'Deterministic artifacts remain the truth source and the workflow can continue without AI.'
        ],
        providerAvailable: false,
        providerName: undefined,
        text: ''
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), route.timeoutMs);
    try {
      return route.mode === 'anthropic-compatible'
        ? await this.completeAnthropic(route, request, controller.signal)
        : await this.completeOpenAi(route, request, controller.signal);
    } catch (error) {
      return {
        modelName: route.modelName,
        notes: [
          `AI provider unavailable during request: ${error instanceof Error ? error.message : String(error)}`,
          'AI augmentation was skipped; deterministic evidence remains the truth source.'
        ],
        providerAvailable: false,
        providerName: route.providerName,
        text: ''
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async completeOpenAi(
    route: ProviderRoute,
    request: LlmCompletionRequest,
    signal: AbortSignal
  ): Promise<LlmCompletionResult> {
    const response = await fetch(`${route.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      body: JSON.stringify({
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        messages: request.messages,
        model: route.modelName,
        temperature: request.temperature ?? 0.2
      }),
      headers: {
        Authorization: `Bearer ${route.apiKey}`,
        'Content-Type': 'application/json'
      },
      method: 'POST',
      signal
    });
    const body = await response.json().catch(() => ({})) as ChatCompletionResponse;
    if (!response.ok) {
      return {
        modelName: route.modelName,
        notes: [
          `AI provider request failed with HTTP ${response.status}: ${body.error?.message ?? response.statusText}`,
          'AI augmentation was skipped; deterministic evidence remains available.'
        ],
        providerAvailable: false,
        providerName: route.providerName,
        text: ''
      };
    }

    const text = body.choices?.[0]?.message?.content ?? body.choices?.[0]?.text ?? '';
    if (!text.trim()) {
      return {
        modelName: route.modelName,
        notes: [
          'AI provider returned an empty response; deterministic fallback explanation was used.'
        ],
        providerAvailable: false,
        providerName: route.providerName,
        text: ''
      };
    }

    return {
      modelName: route.modelName,
      notes: ['AI provider completed a bounded explanation request through an openai-compatible route.'],
      providerAvailable: true,
      providerName: route.providerName,
      text: text.trim()
    };
  }

  private async completeAnthropic(
    route: ProviderRoute,
    request: LlmCompletionRequest,
    signal: AbortSignal
  ): Promise<LlmCompletionResult> {
    const response = await fetch(`${route.baseUrl.replace(/\/+$/, '')}/v1/messages`, {
      body: JSON.stringify({
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        messages: toAnthropicMessages(request.messages),
        model: route.modelName,
        system: systemPrompt(request.messages),
        temperature: request.temperature ?? 0.2
      }),
      headers: {
        'anthropic-version': ANTHROPIC_VERSION,
        'Content-Type': 'application/json',
        'x-api-key': route.apiKey
      },
      method: 'POST',
      signal
    });
    const body = await response.json().catch(() => ({})) as AnthropicMessagesResponse;
    if (!response.ok) {
      return {
        modelName: route.modelName,
        notes: [
          `Anthropic-compatible provider request failed with HTTP ${response.status}: ${body.error?.message ?? response.statusText}`,
          'AI augmentation was skipped; deterministic evidence remains available.'
        ],
        providerAvailable: false,
        providerName: route.providerName,
        text: ''
      };
    }

    const text = body.content?.map((item) => item.text ?? '').join('\n').trim() ?? '';
    if (!text) {
      return {
        modelName: route.modelName,
        notes: [
          'Anthropic-compatible provider returned an empty response; deterministic fallback explanation was used.'
        ],
        providerAvailable: false,
        providerName: route.providerName,
        text: ''
      };
    }

    return {
      modelName: route.modelName,
      notes: ['AI provider completed a bounded explanation request through an anthropic-compatible route.'],
      providerAvailable: true,
      providerName: route.providerName,
      text
    };
  }

  private resolveRoute(): ProviderRoute | null {
    const configured = this.resolveConfiguredProviderName();
    if (configured?.mode === 'anthropic-compatible') {
      return this.resolveAnthropicRoute();
    }
    if (configured?.mode === 'openai-compatible') {
      return this.resolveOpenAiRoute(configured.rawProviderName);
    }

    return this.resolveAnthropicRoute() ?? this.resolveOpenAiRoute('openai-compatible');
  }

  private resolveConfiguredProviderName():
    | { mode: 'anthropic-compatible'; rawProviderName: string }
    | { mode: 'openai-compatible'; rawProviderName: string }
    | null {
    const provider = this.config.providerName?.trim();
    if (!provider || provider.toLowerCase() === 'none' || provider.toLowerCase() === 'off') {
      return null;
    }
    const normalized = provider.toLowerCase();
    if (normalized.includes('anthropic') || normalized.includes('claude')) {
      return {
        mode: 'anthropic-compatible',
        rawProviderName: provider
      };
    }
    return {
      mode: 'openai-compatible',
      rawProviderName: provider
    };
  }

  private resolveOpenAiRoute(providerName: string): ProviderRoute | null {
    const apiKey = this.config.apiKey?.trim();
    const modelName = this.config.modelName?.trim();
    const baseUrl = this.resolveOpenAiBaseUrl(providerName);
    if (!apiKey || !modelName || !baseUrl) {
      return null;
    }
    return {
      apiKey,
      baseUrl,
      mode: 'openai-compatible',
      modelName,
      providerName,
      timeoutMs: this.config.timeoutMs
    };
  }

  private resolveAnthropicRoute(): ProviderRoute | null {
    const apiKey = this.config.anthropicApiKey?.trim() || this.config.apiKey?.trim();
    const modelName = this.config.anthropicModelName?.trim()
      || (this.config.providerName?.toLowerCase().includes('anthropic') ? this.config.modelName?.trim() : undefined);
    const baseUrl = this.config.anthropicBaseUrl?.trim()
      || (this.config.providerName?.toLowerCase().includes('anthropic') ? this.config.baseUrl?.trim() : undefined)
      || ANTHROPIC_BASE_URL;
    if (!apiKey || !modelName) {
      return null;
    }
    return {
      apiKey,
      baseUrl,
      mode: 'anthropic-compatible',
      modelName,
      providerName: this.config.providerName?.trim() || 'anthropic-compatible',
      timeoutMs: this.config.timeoutMs
    };
  }

  private resolveOpenAiBaseUrl(providerName: string): string | undefined {
    if (this.config.baseUrl?.trim()) {
      return this.config.baseUrl.trim();
    }
    const normalized = providerName.toLowerCase();
    if (normalized === 'openai' || normalized === 'openai-compatible') {
      return OPENAI_BASE_URL;
    }
    return this.config.providerName ? undefined : OPENAI_BASE_URL;
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

function systemPrompt(messages: readonly LlmChatMessage[]): string | undefined {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join('\n\n');
  return system || undefined;
}

function toAnthropicMessages(messages: readonly LlmChatMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      content: message.content,
      role: message.role === 'assistant' ? 'assistant' : 'user'
    }));
}
