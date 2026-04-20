import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  code: z.string(),
  useAI: z.boolean().optional()
});

type DetectCryptoParams = z.infer<typeof schema>;

export const detectCryptoTool = defineTool<DetectCryptoParams>({
  name: 'detect_crypto',
  description: 'Detect crypto algorithms, libraries, and security issues using deterministic static rules.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => ({
    crypto: await context.runtime.getCryptoDetector().detect({
      code: params.code,
      useAI: params.useAI
    })
  })
});
