import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { runDebuggerStep } from './stepOver.js';

const schema = z.object({
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type StepOutParams = z.infer<typeof schema>;

export const stepOutTool = defineTool<StepOutParams>({
  name: 'step_out',
  description: 'Breakpoint-last debugger inspection: step out of the current paused frame without turning debugger into the default reverse path.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => runDebuggerStep(context, params, 'out')
});
