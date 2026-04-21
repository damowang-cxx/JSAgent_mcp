import type { CompareAnchor, CompareAnchorSelectionResult } from '../compare/types.js';

export class CompareAnchorReportBuilder {
  async build(result: CompareAnchorSelectionResult, format: 'json' | 'markdown'): Promise<{ json?: object; markdown?: string }> {
    if (format === 'json') {
      return { json: this.toJson(result) };
    }

    return { markdown: this.toMarkdown(result) };
  }

  private toJson(result: CompareAnchorSelectionResult): Record<string, unknown> {
    return {
      candidates: result.candidates,
      nextActions: result.nextActions,
      notes: result.notes,
      selected: result.selected,
      stopIf: result.stopIf
    };
  }

  private toMarkdown(result: CompareAnchorSelectionResult): string {
    const selected = result.selected;
    const lines = [
      '# JSAgent_mcp Compare Anchor Report',
      '',
      '## Selected Anchor',
      '',
      ...this.selectedLines(selected),
      '',
      '## Candidate Anchors',
      '',
      ...this.candidateLines(result.candidates),
      '',
      '## Evidence Sources',
      '',
      ...this.evidenceLines(result.candidates),
      '',
      '## Compare Strategy',
      '',
      selected ? `- ${selected.compareStrategy}: ${selected.path ?? selected.label}` : '- No compare strategy selected.',
      '',
      '## Reason',
      '',
      selected ? `- ${selected.reason}` : '- No selected anchor reason is available.',
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

  private selectedLines(anchor: CompareAnchor | null): string[] {
    if (!anchor) {
      return ['- No compare anchor selected.'];
    }

    return [
      `- ID: ${anchor.anchorId}`,
      `- Kind: ${anchor.kind}`,
      `- Label: ${anchor.label}`,
      `- Path: ${anchor.path ?? '(none)'}`,
      `- Confidence: ${anchor.confidence}`,
      `- Strategy: ${anchor.compareStrategy}`,
      `- Expected Origin: ${anchor.expectedOrigin ?? '(unknown)'}`
    ];
  }

  private candidateLines(candidates: readonly CompareAnchor[]): string[] {
    if (candidates.length === 0) {
      return ['- No candidate anchors were inferred.'];
    }

    return candidates.slice(0, 30).map((candidate) =>
      `- ${candidate.kind}: ${candidate.label} path=${candidate.path ?? '(none)'} confidence=${candidate.confidence} strategy=${candidate.compareStrategy}`
    );
  }

  private evidenceLines(candidates: readonly CompareAnchor[]): string[] {
    const entries = new Map<string, number>();
    for (const candidate of candidates) {
      for (const source of candidate.sourceEvidence) {
        entries.set(source, (entries.get(source) ?? 0) + 1);
      }
    }

    if (entries.size === 0) {
      return ['- No evidence sources were available.'];
    }

    return Array.from(entries.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([source, count]) => `- ${source}: ${count} candidate(s)`);
  }

  private bulletLines(values: readonly string[], empty: string): string[] {
    if (values.length === 0) {
      return [`- ${empty}`];
    }
    return values.slice(0, 40).map((value) => `- ${value}`);
  }
}
