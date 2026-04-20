import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  aggressive: z.boolean().optional(),
  code: z.string(),
  explain: z.boolean().optional(),
  renameVariables: z.boolean().optional()
});

type DeobfuscateCodeParams = z.infer<typeof schema>;

export const deobfuscateCodeTool = defineTool<DeobfuscateCodeParams>({
  name: 'deobfuscate_code',
  description: 'Run a deterministic-first JavaScript deobfuscation pipeline with safe partial results.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => ({
    deobfuscation: await context.runtime.getDeobfuscator().deobfuscate(params)
  })
});
