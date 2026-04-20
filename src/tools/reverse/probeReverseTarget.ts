import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const collectSchema = z
  .object({
    dynamicWaitMs: z.number().int().positive().optional(),
    includeDynamic: z.boolean().optional(),
    includeExternal: z.boolean().optional(),
    includeInline: z.boolean().optional(),
    returnMode: z.enum(['summary', 'top-priority']).optional(),
    topN: z.number().int().positive().optional()
  })
  .optional();

const schema = z.object({
  autoInjectHooks: z.boolean().optional(),
  collect: collectSchema,
  goal: z.string().optional(),
  hookTypes: z.array(z.enum(['fetch', 'xhr'])).optional(),
  targetUrl: z.string().optional(),
  taskId: z.string().optional(),
  taskSlug: z.string().optional(),
  url: z.string().optional(),
  waitAfterSetupMs: z.number().int().positive().optional(),
  writeEvidence: z.boolean().optional()
});

type ProbeReverseTargetParams = z.infer<typeof schema>;

export const probeReverseTargetTool = defineTool<ProbeReverseTargetParams>({
  name: 'probe_reverse_target',
  description: 'Run an observe-first reverse probing workflow around the selected page or target URL.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => ({
    ...(await context.runtime.getReverseWorkflowRunner().probe(params))
  })
});
