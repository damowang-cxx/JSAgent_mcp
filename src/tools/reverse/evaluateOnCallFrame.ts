import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { writeDebuggerInspectionEvidence } from './debuggerInspectionArtifacts.js';

const schema = z.object({
  expression: z.string(),
  frameIndex: z.number().int().min(0).optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type EvaluateOnCallFrameParams = z.infer<typeof schema>;

export const evaluateOnCallFrameTool = defineTool<EvaluateOnCallFrameParams>({
  name: 'evaluate_on_call_frame',
  description: 'Evaluate a small expression on the current paused call frame for breakpoint-last reverse inspection; no expression manager is kept.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const frameIndex = params.frameIndex ?? 0;
    const result = await context.runtime.getPausedInspector().evaluateOnCallFrame({
      expression: params.expression,
      frameIndex
    });
    const callFrames = await context.runtime.getPausedInspector().getCallFrames();
    const correlations = await context.runtime.getDebuggerEvidenceCorrelator().correlatePausedState();
    const evidenceWritten = await writeDebuggerInspectionEvidence(context, {
      callFrames,
      correlations,
      evaluation: result,
      frameIndex,
      notes: ['Call-frame evaluation result was serialized safely and no expression history was retained.'],
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });

    return {
      evidenceWritten,
      result
    };
  }
});
