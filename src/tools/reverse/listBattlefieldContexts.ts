import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { readBattlefieldSnapshot } from './battlefieldToolHelpers.js';

const schema = z.object({
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional()
});

type ListBattlefieldContextsParams = z.infer<typeof schema>;

export const listBattlefieldContextsTool = defineTool<ListBattlefieldContextsParams>({
  name: 'list_battlefield_contexts',
  description: 'Read the latest battlefield integration snapshot from runtime or task artifacts so browser/source/scalpel/debugger lineage can be reviewed before broader escalation.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    const resolved = await readBattlefieldSnapshot(context, params, 'list_battlefield_contexts');
    return {
      result: resolved.snapshot,
      source: resolved.source
    };
  }
});

