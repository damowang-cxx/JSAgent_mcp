import type { BattlefieldIntegrationSnapshot } from '../battlefield/types.js';

export class BattlefieldIntegrationReportBuilder {
  async build(
    snapshot: BattlefieldIntegrationSnapshot,
    format: 'json' | 'markdown'
  ): Promise<{ json?: Record<string, unknown>; markdown?: string }> {
    if (format === 'json') {
      return {
        json: snapshot as unknown as Record<string, unknown>
      };
    }

    return {
      markdown: this.toMarkdown(snapshot)
    };
  }

  private toMarkdown(snapshot: BattlefieldIntegrationSnapshot): string {
    const context = snapshot.context;
    const lines = [
      '# JSAgent_mcp Battlefield Integration Report',
      '',
      '## Battlefield Context',
      '',
      `- Context: ${context.contextId}`,
      `- Selected Page: ${context.selectedPage ?? '(none)'}`,
      '',
      '## Browser Ops State',
      '',
      `- Session State Available: ${context.browserOps?.sessionStateAvailable ?? false}`,
      `- Storage Snapshot Available: ${context.browserOps?.storageSnapshotAvailable ?? false}`,
      `- Preload Active: ${context.browserOps?.preloadActive ?? false}`,
      `- Stealth State: ${context.browserOps?.stealthState ?? '(none)'}`,
      '',
      '## Source Precision State',
      '',
      `- Script Count: ${context.sourcePrecision?.scriptCount ?? 0}`,
      `- Last Search Available: ${context.sourcePrecision?.lastSearchAvailable ?? false}`,
      `- Last Find Available: ${context.sourcePrecision?.lastFindAvailable ?? false}`,
      '',
      '## Debugger Finishing State',
      '',
      `- Exception Mode: ${context.debuggerFinishing?.exceptionMode ?? '(none)'}`,
      `- Watch Count: ${context.debuggerFinishing?.watchCount ?? 0}`,
      `- Target Count: ${context.debuggerFinishing?.targetCount ?? 0}`,
      '',
      '## Function Scalpel State',
      '',
      `- Hook Count: ${context.functionScalpel?.hookCount ?? 0}`,
      `- Trace Count: ${context.functionScalpel?.traceCount ?? 0}`,
      `- Monitor Count: ${context.functionScalpel?.monitorCount ?? 0}`,
      '',
      '## Substrate State',
      '',
      `- AST Available: ${context.substrate?.astAvailable ?? false}`,
      `- AI Routing Available: ${context.substrate?.aiRoutingAvailable ?? false}`,
      `- Stealth Feature State Available: ${context.substrate?.stealthFeatureStateAvailable ?? false}`,
      '',
      '## Structured Workflow State',
      '',
      `- Scenario Available: ${context.structuredWorkflow?.scenarioAvailable ?? false}`,
      `- Capture Available: ${context.structuredWorkflow?.captureAvailable ?? false}`,
      `- Helper Boundary Available: ${context.structuredWorkflow?.helperBoundaryAvailable ?? false}`,
      `- Dependency Window Available: ${context.structuredWorkflow?.dependencyWindowAvailable ?? false}`,
      `- Compare Anchor Available: ${context.structuredWorkflow?.compareAnchorAvailable ?? false}`,
      `- Patch Preflight Available: ${context.structuredWorkflow?.patchPreflightAvailable ?? false}`,
      `- Rebuild Context Available: ${context.structuredWorkflow?.rebuildContextAvailable ?? false}`,
      `- Flow Reasoning Available: ${context.structuredWorkflow?.flowReasoningAvailable ?? false}`,
      `- Pure Preflight Available: ${context.structuredWorkflow?.purePreflightAvailable ?? false}`,
      `- Regression Context Available: ${context.structuredWorkflow?.regressionContextAvailable ?? false}`,
      `- Delivery Context Available: ${context.structuredWorkflow?.deliveryContextAvailable ?? false}`,
      '',
      '## Recommended Next Phase',
      '',
      `- ${snapshot.actionPlan?.phase ?? '(none)'}`,
      ...(snapshot.actionPlan ? [`- Why: ${snapshot.actionPlan.why}`] : []),
      '',
      '## Next Actions',
      '',
      ...(snapshot.actionPlan?.nextActions ?? context.nextActions).map((item) => `- ${item}`),
      '',
      '## Stop If',
      '',
      ...(snapshot.actionPlan?.stopIf ?? context.stopIf).map((item) => `- ${item}`),
      '',
      '## Notes',
      '',
      ...((snapshot.notes ?? context.notes).length > 0
        ? (snapshot.notes ?? context.notes).map((item) => `- ${item}`)
        : ['- Battlefield integration keeps browser/source/scalpel/debugger evidence aligned with the structured reverse chain.'])
    ];

    return `${lines.join('\n')}\n`;
  }
}

