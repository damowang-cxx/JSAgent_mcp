import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { recordBrowserOps } from './browserOpsToolHelpers.js';

const schema = z.object({
  type: z.enum(['cookies', 'localStorage', 'sessionStorage', 'all']).optional(),
  filter: z.string().optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type GetStorageParams = z.infer<typeof schema>;

export const getStorageTool = defineTool<GetStorageParams>({
  name: 'get_storage',
  description: 'Read cookies/localStorage/sessionStorage from the selected page as bounded field evidence before heavier workflows.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getStorageInspector().get(params);
    const evidenceWritten = await recordBrowserOps(context, {
      evidence: {
        cookieCount: result.cookies?.length ?? 0,
        kind: 'browser_storage',
        localStorageCount: result.localStorage?.length ?? 0,
        sessionStorageCount: result.sessionStorage?.length ?? 0,
        type: params.type ?? 'all'
      },
      snapshotPatch: {
        lastStorageSnapshot: result,
        notes: ['Storage snapshot captured from selected page/context only.']
      },
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });
    return {
      evidenceWritten,
      result
    };
  }
});
