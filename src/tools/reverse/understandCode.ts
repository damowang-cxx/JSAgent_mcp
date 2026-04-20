import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  code: z.string(),
  focus: z.enum(['all', 'structure', 'business', 'security']).optional()
});

type UnderstandCodeParams = z.infer<typeof schema>;

export const understandCodeTool = defineTool<UnderstandCodeParams>({
  name: 'understand_code',
  description: 'Run deterministic static analysis over JavaScript code for structure, business signals, security, and metrics.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => ({
    analysis: await context.runtime.getStaticAnalyzer().understand({
      code: params.code,
      focus: params.focus
    })
  })
});
