import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const collectSchema = z
  .object({
    dynamicWaitMs: z.number().int().positive().optional(),
    includeDynamic: z.boolean().optional(),
    includeExternal: z.boolean().optional(),
    includeInline: z.boolean().optional(),
    maxFileSize: z.number().int().positive().optional(),
    maxTotalSize: z.number().int().positive().optional()
  })
  .optional();

const schema = z.object({
  autoInjectHooks: z.boolean().optional(),
  collect: collectSchema,
  goal: z.string().optional(),
  hookPreset: z.enum(['none', 'api-signature', 'network-core']).optional(),
  maxFingerprints: z.number().int().positive().optional(),
  targetUrl: z.string().optional(),
  taskId: z.string().optional(),
  taskSlug: z.string().optional(),
  topN: z.number().int().positive().optional(),
  url: z.string(),
  waitAfterHookMs: z.number().int().positive().optional(),
  writeEvidence: z.boolean().optional()
});

type AnalyzeTargetParams = z.infer<typeof schema>;

export const analyzeTargetTool = defineTool<AnalyzeTargetParams>({
  name: 'analyze_target',
  description: 'Run a lite analyze workflow: collect, summarize, understand, detect crypto, score risk, correlate hooks/network, and recommend next steps.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => ({
    ...(await context.runtime.getAnalyzeTargetRunner().analyze(params))
  })
});
