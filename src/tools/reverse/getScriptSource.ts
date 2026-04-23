import { z } from 'zod';

import type { SourceExtractionSummary } from '../../source-intel/types.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  scriptId: z.string(),
  startLine: z.number().int().min(1).optional(),
  endLine: z.number().int().min(1).optional(),
  offset: z.number().int().nonnegative().optional(),
  length: z.number().int().positive().optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type GetScriptSourceParams = z.infer<typeof schema>;

export const getScriptSourceTool = defineTool<GetScriptSourceParams>({
  name: 'get_script_source',
  description: 'Read bounded live script source from the selected page by scriptId; observe-first and script-first before broad collected-code analysis, with breakpoints used last.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getSourceReader().get(params);
    const summary: SourceExtractionSummary = {
      scriptId: result.scriptId,
      ...(result.url ? { url: result.url } : {}),
      mode: result.mode,
      ...(result.startLine !== undefined ? { startLine: result.startLine } : {}),
      ...(result.endLine !== undefined ? { endLine: result.endLine } : {}),
      ...(result.offset !== undefined ? { offset: result.offset } : {}),
      length: result.length ?? result.text.length,
      sourceLength: result.sourceLength,
      totalLines: result.totalLines,
      truncated: result.truncated
    };
    const snapshot = {
      lastSourceRead: summary,
      notes: ['Live source excerpt was read through Debugger.getScriptSource; full source text is returned to the caller only and not stored in artifacts.']
    };
    context.runtime.getSourcePrecisionRegistry().setLast(snapshot);

    let evidenceWritten = false;
    if (params.taskId && params.writeEvidence) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      await evidenceStore.appendLog(params.taskId, 'runtime-evidence', {
        kind: 'source_script_read',
        ...summary
      });
      await context.runtime.getSourcePrecisionRegistry().storeToTask(params.taskId, snapshot);
      evidenceWritten = true;
    }

    return {
      evidenceWritten,
      result
    };
  }
});
