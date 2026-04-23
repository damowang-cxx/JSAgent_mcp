import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { buildDebuggerFinishingSnapshot, recordDebuggerFinishing } from './debuggerFinishingToolHelpers.js';

const schema = z.object({
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type ListDebugTargetsParams = z.infer<typeof schema>;

export const listDebugTargetsTool = defineTool<ListDebugTargetsParams>({
  name: 'list_debug_targets',
  description: 'Observe-first, hook-preferred, breakpoint-last debugger target listing for selected browser session pages and basic workers; lite orchestration, not a DevTools target graph.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const items = await context.runtime.getDebugTargetCatalog().list();
    const snapshot = buildDebuggerFinishingSnapshot(context, {
      lastDebugTargets: items,
      currentDebugTargetId: context.runtime.getDebuggerSessionManager().getCurrentDebugTargetId(),
      notes: ['Debug targets listed from the shared BrowserSessionManager browser; selected page remains the primary owner.']
    });
    const evidenceWritten = await recordDebuggerFinishing(context, {
      evidence: {
        count: items.length,
        kind: 'debugger_target_list'
      },
      snapshot,
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });

    return {
      evidenceWritten,
      items
    };
  }
});
