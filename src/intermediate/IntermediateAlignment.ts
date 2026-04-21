export class IntermediateAlignment {
  async align(input: {
    node?: Record<string, unknown>;
    python?: Record<string, unknown>;
    runtime?: Record<string, unknown>;
  }): Promise<{
    keys: string[];
    aligned: Record<string, { node?: unknown; python?: unknown; runtime?: unknown }>;
  }> {
    const keys = Array.from(new Set([
      ...Object.keys(input.node ?? {}),
      ...Object.keys(input.python ?? {}),
      ...Object.keys(input.runtime ?? {})
    ])).sort();

    return {
      aligned: Object.fromEntries(keys.map((key) => [key, {
        node: input.node?.[key],
        python: input.python?.[key],
        runtime: input.runtime?.[key]
      }])),
      keys
    };
  }
}
