import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  topN: z.number().int().positive().optional()
});

type LocateCryptoHelpersParams = z.infer<typeof schema>;

export const locateCryptoHelpersTool = defineTool<LocateCryptoHelpersParams>({
  name: 'locate_crypto_helpers',
  description: 'Locate crypto/hash/HMAC/AES/RSA/base64/encode helpers worth auditing for request parameters.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => ({
    result: await context.runtime.getCryptoHelperLocator().locate({
      topN: params.topN
    })
  })
});
