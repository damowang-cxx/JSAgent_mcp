import type { AiAugmentationMode, AiSourceArtifact, LlmChatMessage } from './types.js';

const MAX_CONTEXT_CHARS = 12_000;

export class AiPromptLibrary {
  buildDeobfuscationExplainPrompt(artifacts: readonly AiSourceArtifact[]): LlmChatMessage[] {
    return this.buildPrompt('deobfuscation-explain', artifacts);
  }

  buildAnalyzeTargetExplainPrompt(artifacts: readonly AiSourceArtifact[]): LlmChatMessage[] {
    return this.buildPrompt('analyze-target-explain', artifacts);
  }

  buildFlowReasoningExplainPrompt(artifacts: readonly AiSourceArtifact[]): LlmChatMessage[] {
    return this.buildPrompt('flow-reasoning-explain', artifacts);
  }

  buildCompareAnchorExplainPrompt(artifacts: readonly AiSourceArtifact[]): LlmChatMessage[] {
    return this.buildPrompt('compare-anchor-explain', artifacts);
  }

  buildPatchPreflightExplainPrompt(artifacts: readonly AiSourceArtifact[]): LlmChatMessage[] {
    return this.buildPrompt('patch-preflight-explain', artifacts);
  }

  buildRebuildContextExplainPrompt(artifacts: readonly AiSourceArtifact[]): LlmChatMessage[] {
    return this.buildPrompt('rebuild-context-explain', artifacts);
  }

  buildPurePreflightExplainPrompt(artifacts: readonly AiSourceArtifact[]): LlmChatMessage[] {
    return this.buildPrompt('pure-preflight-explain', artifacts);
  }

  buildGenericReverseExplainPrompt(artifacts: readonly AiSourceArtifact[]): LlmChatMessage[] {
    return this.buildPrompt('generic-reverse-explain', artifacts);
  }

  buildForMode(mode: AiAugmentationMode, artifacts: readonly AiSourceArtifact[]): LlmChatMessage[] {
    switch (mode) {
      case 'deobfuscation-explain':
        return this.buildDeobfuscationExplainPrompt(artifacts);
      case 'analyze-target-explain':
        return this.buildAnalyzeTargetExplainPrompt(artifacts);
      case 'flow-reasoning-explain':
        return this.buildFlowReasoningExplainPrompt(artifacts);
      case 'compare-anchor-explain':
        return this.buildCompareAnchorExplainPrompt(artifacts);
      case 'patch-preflight-explain':
        return this.buildPatchPreflightExplainPrompt(artifacts);
      case 'rebuild-context-explain':
        return this.buildRebuildContextExplainPrompt(artifacts);
      case 'pure-preflight-explain':
        return this.buildPurePreflightExplainPrompt(artifacts);
      case 'generic-reverse-explain':
      default:
        return this.buildGenericReverseExplainPrompt(artifacts);
    }
  }

  private buildPrompt(mode: AiAugmentationMode, artifacts: readonly AiSourceArtifact[]): LlmChatMessage[] {
    const context = this.renderArtifacts(artifacts);
    return [
      {
        content: [
          'You are an explanation-only reverse-engineering assistant.',
          'Deterministic evidence is primary; do not invent missing facts.',
          'Explain only from the provided artifacts.',
          'Do not choose truth, patch code, synthesize pure implementations, or override compare/rebuild/patch/pure decisions.',
          'Keep the answer concise and actionable.'
        ].join('\n'),
        role: 'system'
      },
      {
        content: [
          `Mode: ${mode}`,
          '',
          'Artifacts:',
          context || '(no deterministic artifacts were available)',
          '',
          'Write a semantic explanation with:',
          '- what the deterministic artifacts say',
          '- what the likely target chain means',
          '- what should be audited next',
          '- explicit cautions that deterministic artifacts remain the truth source'
        ].join('\n'),
        role: 'user'
      }
    ];
  }

  private renderArtifacts(artifacts: readonly AiSourceArtifact[]): string {
    const lines = artifacts.slice(0, 12).map((artifact, index) => [
      `Artifact ${index + 1}:`,
      `kind=${artifact.kind}`,
      artifact.id ? `id=${artifact.id}` : '',
      `summary=${artifact.summary}`
    ].filter(Boolean).join('\n'));
    const rendered = lines.join('\n\n');
    return rendered.length > MAX_CONTEXT_CHARS ? `${rendered.slice(0, MAX_CONTEXT_CHARS)}\n[truncated]` : rendered;
  }
}
