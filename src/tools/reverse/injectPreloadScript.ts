import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { recordBrowserOps } from './browserOpsToolHelpers.js';

const schema = z.object({
  script: z.string(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type InjectPreloadScriptParams = z.infer<typeof schema>;

export const injectPreloadScriptTool = defineTool<InjectPreloadScriptParams>({
  name: 'inject_preload_script',
  description: 'Register a future-document preload script on the selected page; hook-preferred early environment patch, not a site automation platform.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getPreloadScriptRegistry().add(params.script);
    const evidenceWritten = await recordBrowserOps(context, {
      evidence: {
        kind: 'browser_preload',
        scriptId: result.scriptId
      },
      snapshotPatch: {
        activePreloadScripts: context.runtime.getPreloadScriptRegistry().list(),
        notes: [`Registered preload script ${result.scriptId}; it applies to future document loads.`]
      },
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });
    return {
      evidenceWritten,
      scriptId: result.scriptId
    };
  }
});
