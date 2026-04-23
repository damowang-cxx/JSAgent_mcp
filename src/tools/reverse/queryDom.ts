import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { recordBrowserOps } from './browserOpsToolHelpers.js';

const schema = z.object({
  selector: z.string(),
  all: z.boolean().optional(),
  limit: z.number().int().positive().optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type QueryDomParams = z.infer<typeof schema>;

export const queryDomTool = defineTool<QueryDomParams>({
  name: 'query_dom',
  description: 'Observe-first DOM query on the selected page with bounded summaries; useful before hooks, scenarios, or breakpoint-last debugger escalation.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getDomInspector().query(params);
    const evidenceWritten = await recordBrowserOps(context, {
      evidence: {
        count: result.count,
        kind: 'browser_dom_query',
        selector: result.selector
      },
      snapshotPatch: {
        lastDomQuery: result,
        notes: ['DOM query used bounded field-operation summary; no full page HTML was captured.']
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
