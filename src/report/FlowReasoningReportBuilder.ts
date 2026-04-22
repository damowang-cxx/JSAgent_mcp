import type { FlowReasoningEdge, FlowReasoningNode, FlowReasoningResult } from '../flow/types.js';

export class FlowReasoningReportBuilder {
  async build(result: FlowReasoningResult, format: 'json' | 'markdown'): Promise<{ json?: object; markdown?: string }> {
    if (format === 'json') {
      return { json: this.toJson(result) };
    }

    return { markdown: this.toMarkdown(result) };
  }

  private toJson(result: FlowReasoningResult): Record<string, unknown> {
    return {
      edges: result.edges,
      files: result.files,
      helperConsumers: result.helperConsumers,
      notes: result.notes,
      nodes: result.nodes,
      patchHints: result.patchHints,
      rebuildHints: result.rebuildHints,
      requestFieldBindings: result.requestFieldBindings,
      resultId: result.resultId,
      scenario: result.scenario ?? null,
      sinkAdjacentBindings: result.sinkAdjacentBindings,
      targetName: result.targetName
    };
  }

  private toMarkdown(result: FlowReasoningResult): string {
    const lines = [
      '# JSAgent_mcp Flow Reasoning Lite Report',
      '',
      '## Target',
      '',
      `- Result: ${result.resultId}`,
      `- Target: ${result.targetName}`,
      `- Scenario: ${result.scenario ?? '(unknown)'}`,
      '',
      '## Files',
      '',
      ...this.bulletLines(result.files, 'No indexed files.'),
      '',
      '## Nodes',
      '',
      ...this.nodeLines(result.nodes),
      '',
      '## Edges',
      '',
      ...this.edgeLines(result.edges),
      '',
      '## Helper Consumers',
      '',
      ...this.bulletLines(result.helperConsumers, 'No helper return consumers were inferred.'),
      '',
      '## Request Field Bindings',
      '',
      ...this.bulletLines(result.requestFieldBindings, 'No request field binders were inferred.'),
      '',
      '## Sink-Adjacent Bindings',
      '',
      ...this.bulletLines(result.sinkAdjacentBindings, 'No sink-adjacent binders were inferred.'),
      '',
      '## Rebuild Hints',
      '',
      ...this.bulletLines(result.rebuildHints, 'No rebuild hints.'),
      '',
      '## Patch Hints',
      '',
      ...this.bulletLines(result.patchHints, 'No patch hints.'),
      '',
      '## Notes',
      '',
      ...this.bulletLines(result.notes, 'No notes.')
    ];

    return `${lines.join('\n')}\n`;
  }

  private nodeLines(nodes: readonly FlowReasoningNode[]): string[] {
    if (nodes.length === 0) {
      return ['- No nodes were inferred.'];
    }

    return nodes.slice(0, 50).map((node) => {
      const location = node.file && node.lineNumber ? ` @ ${node.file}:${node.lineNumber}` : '';
      return `- ${node.kind}: ${node.name}${location} confidence=${node.confidence} - ${node.reason}`;
    });
  }

  private edgeLines(edges: readonly FlowReasoningEdge[]): string[] {
    if (edges.length === 0) {
      return ['- No edges were inferred.'];
    }

    return edges
      .slice(0, 60)
      .map((edge) => `- ${edge.from} ${edge.relation} ${edge.to} confidence=${edge.confidence} - ${edge.reason}`);
  }

  private bulletLines(values: readonly string[], empty: string): string[] {
    if (values.length === 0) {
      return [`- ${empty}`];
    }
    return values.slice(0, 60).map((value) => `- ${value}`);
  }
}
