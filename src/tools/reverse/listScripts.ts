import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  filter: z.string().optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type ListScriptsParams = z.infer<typeof schema>;

export const listScriptsTool = defineTool<ListScriptsParams>({
  name: 'list_scripts',
  description: 'Observe-first live script enumeration for the selected page; use script-first precision before collected-code fallback, hooks remain preferred, debugger breakpoints remain last.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const items = await context.runtime.getScriptCatalog().list({
      filter: params.filter
    });
    const snapshot = {
      lastScriptList: items,
      notes: ['Live selected-page scripts were enumerated from CDP Debugger.scriptParsed cache, not collected-code artifacts.']
    };
    context.runtime.getSourcePrecisionRegistry().setLast(snapshot);

    let evidenceWritten = false;
    if (params.taskId && params.writeEvidence) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      await evidenceStore.appendLog(params.taskId, 'runtime-evidence', {
        count: items.length,
        filter: params.filter ?? null,
        kind: 'source_script_list'
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
