import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  source: z.enum(['window-last', 'probe-last', 'helper-boundary-last', 'task-artifact']).optional(),
  targetName: z.string().optional(),
  targetUrl: z.string().optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type GenerateBoundaryFixtureParams = z.infer<typeof schema>;

export const generateBoundaryFixtureTool = defineTool<GenerateBoundaryFixtureParams>({
  name: 'generate_boundary_fixture',
  description: 'Generate a smallest useful boundary-driven fixture candidate from window, probe, helper boundary, or task artifacts.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getBoundaryFixtureGenerator().generate({
      source: params.source,
      targetName: params.targetName,
      targetUrl: params.targetUrl,
      taskId: params.taskId
    });

    if (params.taskId && params.writeEvidence) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({
        targetUrl: params.targetUrl,
        taskId: params.taskId
      });
      await evidenceStore.appendLog(params.taskId, 'runtime-evidence', {
        expectedOutputs: result.expectedOutputs,
        fixtureId: result.fixtureId,
        inputs: result.inputs,
        kind: 'boundary_fixture',
        targetName: result.targetName,
        validationAnchors: result.validationAnchors
      });
      await context.runtime.getFixtureCandidateRegistry().storeToTask(params.taskId, result);
      await context.runtime.getTaskManifestManager().ensureTask(params.taskId, {
        targetUrl: params.targetUrl
      });
      await context.runtime.getTaskManifestManager().updatePointers(params.taskId, {
        boundaryFixture: 'boundary-fixture/latest'
      });
    } else {
      context.runtime.getFixtureCandidateRegistry().setLast(result);
    }

    return {
      evidenceWritten: Boolean(params.taskId && params.writeEvidence),
      result
    };
  }
});
