import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { writeDebuggerInspectionEvidence } from './debuggerInspectionArtifacts.js';

const schema = z.object({
  frameIndex: z.number().int().min(0).optional(),
  maxVariables: z.number().int().min(1).max(500).optional(),
  maxDepth: z.number().int().min(0).max(3).optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type GetScopeVariablesParams = z.infer<typeof schema>;

export const getScopeVariablesTool = defineTool<GetScopeVariablesParams>({
  name: 'get_scope_variables',
  description: 'Read bounded local/closure/block scope variable summaries from the current paused frame. Debugger inspection remains breakpoint-last.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const frameIndex = params.frameIndex ?? 0;
    const scopes = await context.runtime.getPausedInspector().getScopeVariables({
      frameIndex,
      maxDepth: params.maxDepth,
      maxVariables: params.maxVariables
    });
    const callFrames = await context.runtime.getPausedInspector().getCallFrames();
    const correlations = await context.runtime.getDebuggerEvidenceCorrelator().correlatePausedState();
    const evidenceWritten = await writeDebuggerInspectionEvidence(context, {
      callFrames,
      correlations,
      frameIndex,
      notes: ['Scope variables were serialized with bounded depth and variable count.'],
      scopes,
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });

    return {
      evidenceWritten,
      frameIndex,
      scopes
    };
  }
});
