import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({});

type ListAiProvidersParams = z.infer<typeof schema>;

export const listAiProvidersTool = defineTool<ListAiProvidersParams>({
  name: 'list_ai_providers',
  description: 'List AI provider substrate availability across deterministic-only, openai-compatible, and anthropic-compatible routes; AI remains a semantic enhancer only.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async (_request, context) => ({
    items: context.runtime.getAiProviderCatalog().listProviders()
  })
});
