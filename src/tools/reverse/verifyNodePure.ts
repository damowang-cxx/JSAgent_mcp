import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  entryFile: z.string(),
  expectedOutput: z.unknown().optional(),
  fixtureFile: z.string(),
  taskId: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  writeSnapshot: z.boolean().optional()
});

type VerifyNodePureParams = z.infer<typeof schema>;

export const verifyNodePureTool = defineTool<VerifyNodePureParams>({
  name: 'verify_node_pure',
  description: 'Run a Node pure scaffold and compare its output with fixture expectedOutput.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const verification = await context.runtime.getPureVerifier().verify({
      entryFile: params.entryFile,
      expectedOutput: params.expectedOutput,
      fixtureFile: params.fixtureFile,
      timeoutMs: params.timeoutMs
    });

    if (params.writeSnapshot && params.taskId) {
      await context.runtime.getEvidenceStore().openTask({ taskId: params.taskId });
      await context.runtime.getEvidenceStore().writeSnapshot(params.taskId, 'run/pure-verification', verification);
    }

    return {
      verification
    };
  }
});
