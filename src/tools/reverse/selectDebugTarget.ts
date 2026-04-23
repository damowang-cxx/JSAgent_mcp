import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { buildDebuggerFinishingSnapshot, recordDebuggerFinishing } from './debuggerFinishingToolHelpers.js';

const schema = z.object({
  targetId: z.string(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type SelectDebugTargetParams = z.infer<typeof schema>;

export const selectDebugTargetTool = defineTool<SelectDebugTargetParams>({
  name: 'select_debug_target',
  description: 'Observe-first, hook-preferred, breakpoint-last selection of debugger attach target without changing BrowserSessionManager selected page.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const item = await context.runtime.getDebugTargetCatalog().select(params.targetId);
    const targets = await context.runtime.getDebugTargetCatalog().list();
    const snapshot = buildDebuggerFinishingSnapshot(context, {
      currentDebugTargetId: item.targetId,
      lastDebugTargets: targets,
      notes: ['Debugger target selection changed only the debugger CDP attachment; browser selected page was not changed.']
    });
    const evidenceWritten = await recordDebuggerFinishing(context, {
      evidence: {
        kind: 'debugger_target_select',
        target: item
      },
      snapshot,
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });

    return {
      evidenceWritten,
      item
    };
  }
});
