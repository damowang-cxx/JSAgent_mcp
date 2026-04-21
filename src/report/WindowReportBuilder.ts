import type { DependencyWindowResult } from '../window/types.js';

export class WindowReportBuilder {
  async build(result: DependencyWindowResult, format: 'json' | 'markdown'): Promise<{ json?: object; markdown?: string }> {
    const json = this.toJson(result);
    if (format === 'json') {
      return { json };
    }

    return { markdown: this.toMarkdown(result) };
  }

  private toJson(result: DependencyWindowResult): Record<string, unknown> {
    return {
      excludedNoise: result.excludedNoise,
      exportHints: result.exportHints,
      files: result.files,
      inputs: result.inputs,
      nodes: result.nodes,
      notes: result.notes,
      outputs: result.outputs,
      purePreflightHints: result.purePreflightHints,
      rebuildPreflightHints: result.rebuildPreflightHints,
      scenario: result.scenario,
      snippets: result.snippets,
      targetKind: result.targetKind,
      targetName: result.targetName,
      validationAnchors: result.validationAnchors,
      windowId: result.windowId
    };
  }

  private toMarkdown(result: DependencyWindowResult): string {
    const lines = [
      '# JSAgent_mcp Dependency Window Report',
      '',
      '## Target',
      '',
      `- Name: ${result.targetName}`,
      `- Kind: ${result.targetKind}`,
      `- Window ID: ${result.windowId}`,
      '',
      '## Scenario',
      '',
      `- ${result.scenario ?? '(unknown)'}`,
      '',
      '## Files',
      '',
      ...this.bulletLines(result.files, 'No files were associated with the window.'),
      '',
      '## Snippets',
      '',
      ...this.snippetLines(result),
      '',
      '## Nodes',
      '',
      ...this.nodeLines(result),
      '',
      '## Inputs',
      '',
      ...this.inputLines(result),
      '',
      '## Outputs',
      '',
      ...this.outputLines(result),
      '',
      '## Validation Anchors',
      '',
      ...this.anchorLines(result),
      '',
      '## Excluded Noise',
      '',
      ...this.bulletLines(result.excludedNoise, 'No runtime noise exclusions were inferred.'),
      '',
      '## Export Hints',
      '',
      ...this.bulletLines(result.exportHints, 'No export hints were generated.'),
      '',
      '## Rebuild Preflight Hints',
      '',
      ...this.bulletLines(result.rebuildPreflightHints, 'No rebuild preflight hints were generated.'),
      '',
      '## Pure Preflight Hints',
      '',
      ...this.bulletLines(result.purePreflightHints, 'No pure preflight hints were generated.'),
      '',
      '## Notes',
      '',
      ...this.bulletLines(result.notes, 'No notes.')
    ];

    return `${lines.join('\n')}\n`;
  }

  private snippetLines(result: DependencyWindowResult): string[] {
    if (result.snippets.length === 0) {
      return ['- No code snippets were found for the target symbol.'];
    }

    return result.snippets
      .slice(0, 12)
      .map((snippet) => `- ${snippet.file}:${snippet.startLine}-${snippet.endLine} - ${snippet.reason}`);
  }

  private nodeLines(result: DependencyWindowResult): string[] {
    if (result.nodes.length === 0) {
      return ['- No dependency nodes were inferred.'];
    }

    return result.nodes
      .slice(0, 30)
      .map((node) => `- ${node.kind}: ${node.name} (confidence=${node.confidence}) - ${node.reason}`);
  }

  private inputLines(result: DependencyWindowResult): string[] {
    if (result.inputs.length === 0) {
      return ['- No inputs were inferred.'];
    }

    return result.inputs
      .slice(0, 30)
      .map((input) => `- ${input.name} from ${input.source} external=${input.preserveAsExternal} confidence=${input.confidence} - ${input.reason}`);
  }

  private outputLines(result: DependencyWindowResult): string[] {
    if (result.outputs.length === 0) {
      return ['- No outputs were inferred.'];
    }

    return result.outputs
      .slice(0, 30)
      .map((output) => `- ${output.name} -> ${output.target} confidence=${output.confidence} - ${output.reason}`);
  }

  private anchorLines(result: DependencyWindowResult): string[] {
    if (result.validationAnchors.length === 0) {
      return ['- No validation anchors were inferred.'];
    }

    return result.validationAnchors
      .slice(0, 30)
      .map((anchor) => `- ${anchor.type}: ${anchor.value} - ${anchor.reason}`);
  }

  private bulletLines(values: readonly string[], empty: string): string[] {
    if (values.length === 0) {
      return [`- ${empty}`];
    }

    return values.slice(0, 40).map((value) => `- ${value}`);
  }
}
