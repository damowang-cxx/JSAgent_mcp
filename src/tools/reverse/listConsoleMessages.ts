import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { recordBrowserOps } from './browserOpsToolHelpers.js';

const schema = z.object({
  pageSize: z.number().int().positive().optional(),
  pageIdx: z.number().int().nonnegative().optional(),
  types: z.array(z.string()).optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type ListConsoleMessagesParams = z.infer<typeof schema>;

export const listConsoleMessagesTool = defineTool<ListConsoleMessagesParams>({
  name: 'list_console_messages',
  description: 'List bounded selected-page console messages for observe-first field evidence; debugger remains breakpoint-last.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    const collector = context.runtime.getConsoleCollector();
    await collector.ensureAttached();
    const items = collector.listMessages(params);
    const evidenceWritten = await recordBrowserOps(context, {
      evidence: {
        count: items.length,
        kind: 'browser_console',
        types: params.types ?? null
      },
      snapshotPatch: {
        lastConsoleMessages: items,
        notes: ['Console snapshot captured as bounded summaries only.']
      },
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });
    return {
      evidenceWritten,
      items
    };
  }
});
