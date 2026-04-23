import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { recordBrowserOps } from './browserOpsToolHelpers.js';

const schema = z.object({
  selector: z.string(),
  timeoutMs: z.number().int().positive().optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type ClickElementParams = z.infer<typeof schema>;

export const clickElementTool = defineTool<ClickElementParams>({
  name: 'click_element',
  description: 'Minimal selected-page click for browser field operations; observe-first and hook-preferred before heavy workflow escalation.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getDomInspector().click(params);
    const evidenceWritten = await recordBrowserOps(context, {
      evidence: {
        clicked: result.clicked,
        kind: 'browser_click',
        selector: result.selector
      },
      snapshotPatch: {
        notes: [`Clicked ${result.selector}.`]
      },
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });
    return {
      clicked: result.clicked,
      evidenceWritten,
      notes: result.notes,
      selector: result.selector
    };
  }
});
