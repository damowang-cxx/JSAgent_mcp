import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  scriptId: z.string(),
  query: z.string(),
  contextChars: z.number().int().min(0).optional(),
  occurrence: z.number().int().min(1).optional(),
  caseSensitive: z.boolean().optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type FindInScriptParams = z.infer<typeof schema>;

export const findInScriptTool = defineTool<FindInScriptParams>({
  name: 'find_in_script',
  description: 'Exact in-script live source search for selected-page scripts; observe first, prefer hooks for runtime facts, and use breakpoint placement only after precise source location is known.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const items = await context.runtime.getSourceSearchEngine().findInScript(params);
    const snapshot = {
      lastFindResult: items,
      notes: ['Exact find ran against live Debugger.getScriptSource content and returns line/column plus offsets for minified or single-line scripts.']
    };
    context.runtime.getSourcePrecisionRegistry().setLast(snapshot);

    let evidenceWritten = false;
    if (params.taskId && params.writeEvidence) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      await evidenceStore.appendLog(params.taskId, 'runtime-evidence', {
        caseSensitive: Boolean(params.caseSensitive),
        count: items.length,
        kind: 'source_find_in_script',
        occurrence: params.occurrence ?? null,
        query: params.query,
        scriptId: params.scriptId
      });
      await context.runtime.getSourcePrecisionRegistry().storeToTask(params.taskId, snapshot);
      evidenceWritten = true;
    }

    return {
      evidenceWritten,
      items
    };
  }
});
