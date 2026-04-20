import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { asPythonVerification, pythonVerificationSchema } from './portToolHelpers.js';

const schema = z.object({
  nodeOutput: z.unknown().optional(),
  pythonOutput: z.unknown().optional(),
  verification: pythonVerificationSchema
});

type DiffCrossLanguageParams = z.infer<typeof schema>;

export const diffCrossLanguageTool = defineTool<DiffCrossLanguageParams>({
  name: 'diff_cross_language',
  description: 'Summarize cross-language first divergence between Node pure and Python pure outputs.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => ({
    diff: await context.runtime.getCrossLanguageDiff().diff({
      nodeOutput: params.nodeOutput,
      pythonOutput: params.pythonOutput,
      verification: asPythonVerification(params.verification)
    })
  })
});
