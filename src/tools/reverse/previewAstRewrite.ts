import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { recordAstSubstrate } from './astSubstrateToolHelpers.js';

const schema = z.object({
  scriptId: z.string(),
  rewriteKind: z.enum(['rename-local', 'inline-constant', 'pretty-print', 'normalize-member-access']),
  target: z.string().optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type PreviewAstRewriteParams = z.infer<typeof schema>;

export const previewAstRewriteTool = defineTool<PreviewAstRewriteParams>({
  name: 'preview_ast_rewrite',
  description: 'Deterministic read-only AST rewrite preview for source readability; observe-first, AI is not truth, and no patch is applied.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getAstRewritePreviewer().preview(params);
    const current = context.runtime.getAstSubstrateRegistry().getLast();
    const rewritePreviews = [
      ...(current?.rewritePreviews ?? []),
      result
    ].slice(-30);
    const snapshot = {
      rewritePreviews,
      notes: [
        'Rewrite preview is bounded and deterministic; it is not AST patch synthesis or automatic pure implementation.'
      ]
    };
    const evidenceWritten = await recordAstSubstrate(context, {
      evidence: {
        kind: 'ast_substrate',
        previewChars: result.preview.length,
        rewriteKind: result.rewriteKind,
        scriptId: result.scriptId,
        target: params.target ?? null
      },
      snapshot,
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });

    return {
      evidenceWritten,
      result
    };
  }
});
