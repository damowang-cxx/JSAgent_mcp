import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { fixtureSourceSchema, rebuildBundleOptionsSchema } from './rebuildToolHelpers.js';

const schema = z.object({
  export: rebuildBundleOptionsSchema.optional(),
  fixtureSource: fixtureSourceSchema.optional(),
  goal: z.string().optional(),
  run: z
    .object({
      envOverrides: z.record(z.string(), z.unknown()).optional(),
      timeoutMs: z.number().int().positive().optional()
    })
    .optional(),
  targetUrl: z.string().optional(),
  taskId: z.string().optional(),
  taskSlug: z.string().optional(),
  url: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type RunRebuildWorkflowParams = z.infer<typeof schema>;

export const runRebuildWorkflowTool = defineTool<RunRebuildWorkflowParams>({
  name: 'run_rebuild_workflow',
  description: 'Run the rebuild-oriented workflow: fixture, bundle export, probe, first-divergence compare, and patch plan.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => ({
    ...(await context.runtime.getRebuildWorkflowRunner().run(params))
  })
});
