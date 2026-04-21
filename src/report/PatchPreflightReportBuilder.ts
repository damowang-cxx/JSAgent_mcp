import type { PatchPreflightFocus, PatchPreflightResult } from '../patch-preflight/types.js';

export class PatchPreflightReportBuilder {
  async build(result: PatchPreflightResult, format: 'json' | 'markdown'): Promise<{ json?: object; markdown?: string }> {
    if (format === 'json') {
      return { json: this.toJson(result) };
    }

    return { markdown: this.toMarkdown(result) };
  }

  private toJson(result: PatchPreflightResult): Record<string, unknown> {
    return {
      candidates: result.candidates,
      compareAnchorUsed: result.compareAnchorUsed ?? null,
      nextActions: result.nextActions,
      notes: result.notes,
      selected: result.selected,
      stopIf: result.stopIf
    };
  }

  private toMarkdown(result: PatchPreflightResult): string {
    const lines = [
      '# JSAgent_mcp Patch Preflight Report',
      '',
      '## Selected Focus',
      '',
      ...this.selectedLines(result.selected),
      '',
      '## Candidate Surfaces',
      '',
      ...this.candidateLines(result.candidates),
      '',
      '## Compare Anchor Used',
      '',
      result.compareAnchorUsed
        ? `- ${result.compareAnchorUsed.kind}: ${result.compareAnchorUsed.label} (${result.compareAnchorUsed.anchorId})`
        : '- No compare anchor was used.',
      '',
      '## Reasons',
      '',
      ...this.reasonLines(result.candidates),
      '',
      '## Suggested First Patch',
      '',
      result.selected ? `- ${result.selected.suggestedAction}` : '- No first patch action selected.',
      '',
      '## Next Actions',
      '',
      ...this.bulletLines(result.nextActions, 'No next actions.'),
      '',
      '## Stop If',
      '',
      ...this.bulletLines(result.stopIf, 'No stop conditions.'),
      '',
      '## Notes',
      '',
      ...this.bulletLines(result.notes, 'No notes.')
    ];

    return `${lines.join('\n')}\n`;
  }

  private selectedLines(selected: PatchPreflightFocus | null): string[] {
    if (!selected) {
      return ['- No patch preflight focus selected.'];
    }

    return [
      `- Surface: ${selected.surface}`,
      `- Target: ${selected.target}`,
      `- Confidence: ${selected.confidence}`,
      `- Reason: ${selected.reason}`,
      `- Suggested Action: ${selected.suggestedAction}`
    ];
  }

  private candidateLines(candidates: readonly PatchPreflightFocus[]): string[] {
    if (candidates.length === 0) {
      return ['- No patch preflight candidates were inferred.'];
    }

    return candidates.slice(0, 30).map((candidate) =>
      `- ${candidate.surface}: ${candidate.target} confidence=${candidate.confidence} action=${candidate.suggestedAction}`
    );
  }

  private reasonLines(candidates: readonly PatchPreflightFocus[]): string[] {
    if (candidates.length === 0) {
      return ['- No reasons available.'];
    }

    return candidates.slice(0, 20).map((candidate) => `- ${candidate.surface}:${candidate.target} - ${candidate.reason}`);
  }

  private bulletLines(values: readonly string[], empty: string): string[] {
    if (values.length === 0) {
      return [`- ${empty}`];
    }
    return values.slice(0, 40).map((value) => `- ${value}`);
  }
}
