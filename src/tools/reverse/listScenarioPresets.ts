import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({});

type ListScenarioPresetsParams = z.infer<typeof schema>;

export const listScenarioPresetsTool = defineTool<ListScenarioPresetsParams>({
  name: 'list_scenario_presets',
  description: 'List task-type scenario presets for signature, token-family, anti-bot, and crypto-helper reverse workflows.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async (_request, context) => ({
    presets: context.runtime.getScenarioPresetRegistry().list()
  })
});
