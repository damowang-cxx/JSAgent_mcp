import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  bundleDir: z.string(),
  entryFile: z.string().optional(),
  envOverrides: z.record(z.string(), z.unknown()).optional(),
  fixturePath: z.string().optional(),
  timeoutMs: z.number().int().positive().optional()
});

type RunRebuildProbeParams = z.infer<typeof schema>;

export const runRebuildProbeTool = defineTool<RunRebuildProbeParams>({
  name: 'run_rebuild_probe',
  description: 'Run an exported rebuild bundle entry.js under Node and return structured probe output.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => ({
    run: await context.runtime.getRebuildRunner().run(params)
  })
});
