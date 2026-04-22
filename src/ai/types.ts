export type AiAugmentationMode =
  | 'deobfuscation-explain'
  | 'analyze-target-explain'
  | 'flow-reasoning-explain'
  | 'compare-anchor-explain'
  | 'patch-preflight-explain'
  | 'rebuild-context-explain'
  | 'pure-preflight-explain'
  | 'generic-reverse-explain';

export interface AiSourceArtifact {
  kind: string;
  id?: string;
  summary: string;
}

export interface AiAugmentationResult {
  augmentationId: string;
  mode: AiAugmentationMode;
  providerAvailable: boolean;
  providerName?: string;
  modelName?: string;
  basedOn: AiSourceArtifact[];
  explanation: string;
  cautions: string[];
  nextActions: string[];
  notes: string[];
}

export interface StoredAiAugmentationSnapshot {
  createdAt: string;
  taskId?: string;
  result: AiAugmentationResult;
}

export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmCompletionRequest {
  messages: LlmChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export type LlmCompletionResult =
  | {
      providerAvailable: true;
      providerName: string;
      modelName: string;
      text: string;
      notes: string[];
    }
  | {
      providerAvailable: false;
      providerName?: string;
      modelName?: string;
      text: '';
      notes: string[];
    };
