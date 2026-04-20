import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { extractFixtureForSource, fixtureSourceSchema } from './rebuildToolHelpers.js';

const schema = z.object({
  source: fixtureSourceSchema.optional(),
  taskId: z.string().optional(),
  writeSnapshot: z.boolean().optional()
});

type SavePureFixtureParams = z.infer<typeof schema>;

export const savePureFixtureTool = defineTool<SavePureFixtureParams>({
  name: 'save_pure_fixture',
  description: 'Extract a compact runtime fixture from the current page or latest analyze_target result and optionally save it as evidence.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const fixture = await extractFixtureForSource(context.runtime, params.source ?? 'current-page');
    let task: { taskId: string; taskDir: string } | null = null;

    if (!fixture) {
      throw new AppError(
        'FIXTURE_NOT_AVAILABLE',
        'No current page fixture or cached analyze_target result is available for save_pure_fixture.'
      );
    }

    if (params.writeSnapshot && params.taskId) {
      const opened = await context.runtime.getEvidenceStore().openTask({
        taskId: params.taskId
      });
      task = {
        taskDir: opened.taskDir,
        taskId: opened.taskId
      };
      await context.runtime.getEvidenceStore().writeSnapshot(params.taskId, 'fixture', fixture);
    }

    return {
      fixture,
      task,
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});
