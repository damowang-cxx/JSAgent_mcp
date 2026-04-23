import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { filterEvents, readFunctionScalpelSnapshot } from './functionScalpelToolHelpers.js';

const schema = z.object({
  monitorId: z.string().optional(),
  limit: z.number().int().min(1).optional(),
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional()
});

type ListMonitoredEventsParams = z.infer<typeof schema>;

export const listMonitoredEventsTool = defineTool<ListMonitoredEventsParams>({
  name: 'list_monitored_events',
  description: 'Observe-first, hook-preferred, breakpoint-last list of bounded function scalpel event occurrences.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    if (params.source === 'task-artifact' || params.taskId) {
      const resolved = await readFunctionScalpelSnapshot(context, params, 'list_monitored_events');
      if (resolved.source === 'task-artifact') {
        return {
          items: filterEvents(resolved.snapshot?.events ?? [], params),
          source: resolved.source
        };
      }
    }

    return {
      items: await context.runtime.getEventMonitorRegistry().listEvents(params),
      source: 'runtime-last' as const
    };
  }
});
