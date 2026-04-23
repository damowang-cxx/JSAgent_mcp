import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { appendInspection, buildFunctionScalpelSnapshot, recordFunctionScalpel } from './functionScalpelToolHelpers.js';

const schema = z.object({
  targetExpression: z.string(),
  maxDepth: z.number().int().min(0).optional(),
  maxProperties: z.number().int().min(1).optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type InspectObjectParams = z.infer<typeof schema>;

export const inspectObjectTool = defineTool<InspectObjectParams>({
  name: 'inspect_object',
  description: 'Observe-first, hook-preferred, breakpoint-last bounded runtime object inspection on the selected page.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getObjectInspector().inspect(params);
    const inspections = appendInspection(context, result);
    const snapshot = await buildFunctionScalpelSnapshot(context, {
      inspections,
      notes: ['Object inspection captured bounded own-property previews only.']
    });
    const evidenceWritten = await recordFunctionScalpel(context, {
      evidence: {
        kind: 'function_scalpel_inspect',
        propertyCount: result.properties.length,
        targetExpression: result.targetExpression
      },
      snapshot,
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });

    return {
      evidenceWritten,
      result
    };
  }
});
