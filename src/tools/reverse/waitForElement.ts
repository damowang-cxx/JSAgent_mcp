import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { recordBrowserOps } from './browserOpsToolHelpers.js';

const schema = z.object({
  selector: z.string(),
  timeoutMs: z.number().int().positive().optional(),
  visible: z.boolean().optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type WaitForElementParams = z.infer<typeof schema>;

export const waitForElementTool = defineTool<WaitForElementParams>({
  name: 'wait_for_element',
  description: 'Wait for a selected-page element as a lightweight observe-first field operation before capture/debugger escalation.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getDomInspector().waitFor(params);
    const evidenceWritten = await recordBrowserOps(context, {
      evidence: {
        found: result.found,
        kind: 'browser_wait',
        selector: result.selector,
        waitedMs: result.waitedMs
      },
      snapshotPatch: {
        notes: [`Waited ${result.waitedMs}ms for ${result.selector}.`]
      },
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });
    return {
      evidenceWritten,
      found: result.found,
      selector: result.selector,
      waitedMs: result.waitedMs
    };
  }
});
