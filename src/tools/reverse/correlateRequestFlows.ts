import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  candidateFunctions: z.array(z.string()).optional(),
  correlationWindowMs: z.number().int().positive().optional(),
  cryptoAlgorithms: z.array(z.string()).optional(),
  maxFingerprints: z.number().int().positive().optional(),
  maxFlows: z.number().int().positive().optional(),
  requestSinks: z.array(z.string()).optional()
});

type CorrelateRequestFlowsParams = z.infer<typeof schema>;

export const correlateRequestFlowsTool = defineTool<CorrelateRequestFlowsParams>({
  name: 'correlate_request_flows',
  description: 'Correlate hook records, network records, and request initiators into approximate request flows.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    try {
      const page = await context.browserSession.getSelectedPage();
      return {
        correlation: await context.runtime.getRequestChainCorrelator().correlate(page, params)
      };
    } catch (error) {
      return {
        correlation: {
          correlatedFlows: [],
          networkRequests: [],
          priorityTargets: [],
          requestFingerprints: [],
          suspiciousFlows: [],
          timeline: [],
          warnings: [`Unable to correlate current page: ${error instanceof Error ? error.message : String(error)}`]
        }
      };
    }
  }
});
