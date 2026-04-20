import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  fixtureFile: z.string(),
  nodeEntryFile: z.string(),
  pythonEntryFile: z.string(),
  taskId: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  writeSnapshot: z.boolean().optional()
});

type VerifyPythonPureParams = z.infer<typeof schema>;

export const verifyPythonPureTool = defineTool<VerifyPythonPureParams>({
  name: 'verify_python_pure',
  description: 'Verify Python pure output against the Node pure baseline using the same fixture.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const verification = await context.runtime.getCrossLanguageVerifier().verify({
      fixtureFile: params.fixtureFile,
      nodeEntryFile: params.nodeEntryFile,
      pythonEntryFile: params.pythonEntryFile,
      timeoutMs: params.timeoutMs
    });

    if (params.writeSnapshot && params.taskId) {
      await context.runtime.getEvidenceStore().openTask({ taskId: params.taskId });
      await context.runtime.getEvidenceStore().writeSnapshot(params.taskId, 'run/python-verification', verification);
    }

    return {
      verification,
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});
