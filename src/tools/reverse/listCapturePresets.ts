import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({});

type ListCapturePresetsParams = z.infer<typeof schema>;

export const listCapturePresetsTool = defineTool<ListCapturePresetsParams>({
  name: 'list_capture_presets',
  description: 'List generic replay-oriented capture presets for signature, token, anti-bot, and crypto-helper workflows.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async (_request, context) => ({
    presets: context.runtime.getCapturePresetRegistry().list()
  })
});
