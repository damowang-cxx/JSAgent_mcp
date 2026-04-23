import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({});

type ListStealthFeaturesParams = z.infer<typeof schema>;

export const listStealthFeaturesTool = defineTool<ListStealthFeaturesParams>({
  name: 'list_stealth_features',
  description: 'List canonical stealth feature toggles from the thicker stealth substrate; observe-first, bounded, and not a site adapter.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async (_request, context) => ({
    items: context.runtime.getStealthFeatureRegistry().listFeatures().map((item) => item.featureId)
  })
});
