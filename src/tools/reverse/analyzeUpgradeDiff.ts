import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const sampleSchema = z.object({
  nodeOutput: z.unknown().optional(),
  pythonOutput: z.unknown().optional(),
  runtimeOutput: z.unknown().optional()
});

const schema = z.object({
  newSample: sampleSchema.optional(),
  oldSample: sampleSchema.pick({
    nodeOutput: true,
    pythonOutput: true
  }).optional(),
  targetDescription: z.string().optional()
});

type AnalyzeUpgradeDiffParams = z.infer<typeof schema>;

export const analyzeUpgradeDiffTool = defineTool<AnalyzeUpgradeDiffParams>({
  name: 'analyze_upgrade_diff',
  description: 'Analyze upgrade drift across runtime, Node pure, and Python pure samples.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => ({
    upgradeDiff: await context.runtime.getUpgradeDiffRunner().analyze(params)
  })
});
