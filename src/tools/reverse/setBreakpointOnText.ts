import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { writeBreakpointEvidence } from './setBreakpoint.js';

const schema = z.object({
  occurrence: z.number().int().min(1).optional(),
  targetUrl: z.string().optional(),
  taskId: z.string().optional(),
  text: z.string(),
  urlFilter: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type SetBreakpointOnTextParams = z.infer<typeof schema>;

export const setBreakpointOnTextTool = defineTool<SetBreakpointOnTextParams>({
  name: 'set_breakpoint_on_text',
  description: 'Breakpoint-last debugger fallback: search current CDP script sources and set a breakpoint on matching text when hooks are not enough.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getDebuggerSessionManager().setBreakpointOnText({
      occurrence: params.occurrence,
      text: params.text,
      urlFilter: params.urlFilter
    });
    context.runtime.getBreakpointRegistry().upsert(result.breakpoint);

    const evidenceWritten = await writeBreakpointEvidence(context, {
      breakpoint: result.breakpoint,
      kind: 'debugger_breakpoint_set',
      targetUrl: params.targetUrl,
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });

    return {
      breakpoint: result.breakpoint,
      evidenceWritten,
      matchedLinePreview: result.matchedLinePreview,
      matchedScript: result.matchedScript,
      notes: [
        'Text breakpoint was set from live Debugger.getScriptSource content, not collected-code cache.',
        'Use this only when hook/replay evidence cannot reveal the helper or sink local state.'
      ]
    };
  }
});
