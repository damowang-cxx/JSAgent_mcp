import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { buildFunctionScalpelSnapshot, recordFunctionScalpel } from './functionScalpelToolHelpers.js';

const schema = z.object({
  eventType: z.string(),
  target: z.enum(['document', 'window', 'selector']).optional(),
  selector: z.string().optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type MonitorEventsParams = z.infer<typeof schema>;

export const monitorEventsTool = defineTool<MonitorEventsParams>({
  name: 'monitor_events',
  description: 'Observe-first, hook-preferred, breakpoint-last bounded event monitor for document, window, or one selected element.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const item = await context.runtime.getEventMonitorRegistry().add(params);
    const snapshot = await buildFunctionScalpelSnapshot(context, {
      monitors: context.runtime.getEventMonitorRegistry().listMonitors(),
      notes: ['Event monitor installed with bounded payload previews; this is not a full event recorder.']
    });
    const evidenceWritten = await recordFunctionScalpel(context, {
      evidence: {
        action: 'monitor',
        eventType: item.eventType,
        kind: 'function_scalpel_events',
        monitorId: item.monitorId,
        target: item.target
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
