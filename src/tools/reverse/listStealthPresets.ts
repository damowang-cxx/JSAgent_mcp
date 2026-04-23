import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({});

type ListStealthPresetsParams = z.infer<typeof schema>;

export const listStealthPresetsTool = defineTool<ListStealthPresetsParams>({
  name: 'list_stealth_presets',
  description: 'List minimal preset-based stealth options for browser field operations; not a full anti-detection engine.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async (_request, context) => ({
    items: context.runtime.getStealthPresetRegistry().listPresets()
  })
});
