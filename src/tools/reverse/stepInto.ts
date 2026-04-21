import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { runDebuggerStep } from './stepOver.js';

const schema = z.object({
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type StepIntoParams = z.infer<typeof schema>;

export const stepIntoTool = defineTool<StepIntoParams>({
  name: 'step_into',
  description: 'Breakpoint-last debugger inspection: step into from the current paused frame when hook evidence is insufficient.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => runDebuggerStep(context, params, 'into')
});
