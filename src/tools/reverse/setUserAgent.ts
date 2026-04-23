import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { recordBrowserOps } from './browserOpsToolHelpers.js';

const schema = z.object({
  userAgent: z.string(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type SetUserAgentParams = z.infer<typeof schema>;

export const setUserAgentTool = defineTool<SetUserAgentParams>({
  name: 'set_user_agent',
  description: 'Set selected-page User-Agent as a browser field operation; not a site adapter or full stealth system.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getStealthPresetRegistry().setUserAgent(params.userAgent);
    const evidenceWritten = await recordBrowserOps(context, {
      evidence: {
        kind: 'browser_user_agent',
        userAgent: result.userAgent
      },
      snapshotPatch: {
        currentUserAgent: result.userAgent,
        notes: ['Selected-page User-Agent was changed for field operations.']
      },
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });
    return {
      evidenceWritten,
      userAgent: result.userAgent
    };
  }
});
