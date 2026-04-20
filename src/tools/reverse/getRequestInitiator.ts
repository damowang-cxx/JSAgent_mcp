import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  includeSnapshot: z.boolean().optional(),
  requestId: z.string(),
  taskId: z.string().optional()
});

type GetRequestInitiatorParams = z.infer<typeof schema>;

function toSnapshotName(requestId: string): string {
  return `request-initiator-${requestId.replace(/[^a-zA-Z0-9._-]+/g, '-')}`;
}

export const getRequestInitiatorTool = defineTool<GetRequestInitiatorParams>({
  name: 'get_request_initiator',
  description: 'Approximate which fetch/xhr call site triggered a collected network request.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    await context.runtime.getRequestInitiatorTracker().ensureAttachedToSelectedPage();
    const result = await context.runtime.getNetworkCollector().getRequestInitiator(params.requestId);

    if (params.taskId && result.initiator) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      await evidenceStore.appendLog(params.taskId, 'runtime-evidence', {
        kind: 'request-initiator',
        ...result
      });

      if (params.includeSnapshot) {
        await evidenceStore.writeSnapshot(params.taskId, toSnapshotName(params.requestId), result);
      }
    }

    return {
      ...result
    };
  }
});
