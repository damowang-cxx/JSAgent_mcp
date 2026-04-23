import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({});

type ListStealthFeaturesParams = z.infer<typeof schema>;

export const listStealthFeaturesTool = defineTool<ListStealthFeaturesParams>({
  name: 'list_stealth_features',
  description: 'List minimal stealth feature toggles available to field operations; observe-first and bounded.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async (_request, context) => ({
    items: context.runtime.getStealthPresetRegistry().listFeatures()
  })
});
