import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { recordBrowserOps } from './browserOpsToolHelpers.js';

const schema = z.object({
  selector: z.string(),
  text: z.string(),
  delayMs: z.number().int().nonnegative().optional(),
  clearFirst: z.boolean().optional(),
  timeoutMs: z.number().int().positive().optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type TypeTextParams = z.infer<typeof schema>;

export const typeTextTool = defineTool<TypeTextParams>({
  name: 'type_text',
  description: 'Type text into a selected-page element without echoing secrets by default; field-operation helper before scenario/capture escalation.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getDomInspector().type(params);
    const evidenceWritten = await recordBrowserOps(context, {
      evidence: {
        clearFirst: params.clearFirst ?? false,
        kind: 'browser_type',
        selector: result.selector,
        textLength: result.textLength,
        typed: result.typed
      },
      snapshotPatch: {
        notes: [`Typed ${result.textLength} character(s) into ${result.selector}.`]
      },
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });
    return {
      evidenceWritten,
      selector: result.selector,
      textLength: result.textLength,
      typed: result.typed
    };
  }
});
