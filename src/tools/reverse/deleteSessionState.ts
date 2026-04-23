import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  sessionId: z.string()
});

type DeleteSessionStateParams = z.infer<typeof schema>;

export const deleteSessionStateTool = defineTool<DeleteSessionStateParams>({
  name: 'delete_session_state',
  description: 'Delete an in-memory browser field session state; this does not modify browser profile or task artifacts.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => ({
    deleted: context.runtime.getSessionStateManager().delete(params.sessionId),
    sessionId: params.sessionId
  })
});
