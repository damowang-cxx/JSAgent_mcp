import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  expression: z.string()
});

type EvaluateScriptParams = z.infer<typeof schema>;

export const evaluateScriptTool = defineTool<EvaluateScriptParams>({
  name: 'evaluate_script',
  description: 'Evaluate a JavaScript expression in the currently selected page.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => ({
    value: await context.runtime.getPageController().evaluate(params.expression)
  })
});
