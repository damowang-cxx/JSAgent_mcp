import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { buildFunctionScalpelSnapshot, recordFunctionScalpel } from './functionScalpelToolHelpers.js';

const schema = z.object({
  monitorId: z.string().optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type ClearMonitoredEventsParams = z.infer<typeof schema>;

export const clearMonitoredEventsTool = defineTool<ClearMonitoredEventsParams>({
  name: 'clear_monitored_events',
  description: 'Observe-first, hook-preferred, breakpoint-last clear of bounded monitored event records.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    await context.runtime.getEventMonitorRegistry().clearEvents({
      monitorId: params.monitorId
    });
    const snapshot = await buildFunctionScalpelSnapshot(context, {
      events: await context.runtime.getEventMonitorRegistry().listEvents({ limit: 200 }),
      notes: ['Monitored event records cleared from runtime and selected-page scalpel store.']
    });
    const evidenceWritten = await recordFunctionScalpel(context, {
      evidence: {
        action: 'clear_events',
        kind: 'function_scalpel_events',
        monitorId: params.monitorId ?? null
      },
      snapshot,
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });

    return {
      cleared: true,
      evidenceWritten
    };
  }
});
