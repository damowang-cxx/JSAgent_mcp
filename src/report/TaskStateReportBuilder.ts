import type { StageGateEvaluator } from '../task/StageGateEvaluator.js';
import type { TaskManifestManager } from '../task/TaskManifestManager.js';

export class TaskStateReportBuilder {
  constructor(
    private readonly deps: {
      stageGateEvaluator: StageGateEvaluator;
      taskManifestManager: TaskManifestManager;
    }
  ) {}

  async build(taskId: string, format: 'json' | 'markdown'): Promise<{ json?: Record<string, unknown>; markdown?: string }> {
    await this.deps.taskManifestManager.ensureTask(taskId);
    const gates = await this.deps.stageGateEvaluator.evaluateAll(taskId);
    const manifest = await this.deps.taskManifestManager.getTask(taskId) ?? await this.deps.taskManifestManager.ensureTask(taskId);
    const artifactIndex = await this.deps.taskManifestManager.buildArtifactIndex(taskId);
    const json = {
      artifactIndex,
      gates,
      manifest
    };

    if (format === 'json') {
      return { json };
    }

    return {
      markdown: `${[
        '# JSAgent_mcp Task State Report',
        '',
        '## Current Stage',
        '',
        `- ${manifest.currentStage}`,
        '',
        '## Stage Gates',
        '',
        ...Object.values(gates).map((gate) => `- ${gate.stage}: ${gate.passed ? 'passed' : 'blocked'} (${gate.reasons.join(' ')})`),
        '',
        '## Latest Pointers',
        '',
        ...Object.entries(manifest.latestPointers).map(([key, value]) => `- ${key}: ${value ?? '(none)'}`),
        '',
        '## Missing Artifacts',
        '',
        ...Object.values(gates).flatMap((gate) => gate.missingArtifacts.map((item) => `- ${gate.stage}: ${item}`)),
        '',
        '## Recommended Next Actions',
        '',
        ...Object.values(gates)
          .filter((gate) => !gate.passed)
          .flatMap((gate) => gate.nextActions.map((item) => `- ${gate.stage}: ${item}`))
      ].join('\n')}\n`
    };
  }
}
