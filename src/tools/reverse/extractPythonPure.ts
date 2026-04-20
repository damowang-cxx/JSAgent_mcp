import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  overwrite: z.boolean().optional(),
  taskId: z.string().optional()
});

type ExtractPythonPureParams = z.infer<typeof schema>;

export const extractPythonPureTool = defineTool<ExtractPythonPureParams>({
  name: 'extract_python_pure',
  description: 'Generate a Python pure scaffold from the gated Node pure baseline and fixture.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const baseline = await context.runtime.getPortWorkflowRunner().getPureBaseline(params.taskId);
    if (!baseline.readyForPort || !baseline.verification.ok) {
      throw new AppError('PORT_GATE_NOT_SATISFIED', 'PureExtraction gate is not satisfied; do not export Python pure yet.', {
        pureVerificationOk: baseline.verification.ok,
        readyForPort: baseline.readyForPort
      });
    }

    return {
      pythonPure: await context.runtime.getPythonPortExtractor().extract({
        fixture: baseline.fixture,
        nodePure: baseline.node,
        overwrite: params.overwrite,
        taskId: params.taskId
      })
    };
  }
});
