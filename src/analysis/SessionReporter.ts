import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import type { CodeCollector } from '../collector/CodeCollector.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { ReverseTaskDescriptor } from '../evidence/types.js';
import type { HookManager } from '../hook/HookManager.js';
import type { NetworkCollector } from '../network/NetworkCollector.js';
import type { CryptoDetector } from './CryptoDetector.js';
import type { RiskScorer } from './RiskScorer.js';
import type { StaticAnalyzer } from './StaticAnalyzer.js';
import type { SessionReport } from './types.js';

export class SessionReporter {
  constructor(
    private readonly deps: {
      browserSession: BrowserSessionManager;
      codeCollector: CodeCollector;
      hookManager: HookManager;
      networkCollector: NetworkCollector;
      evidenceStore: EvidenceStore;
      staticAnalyzer: StaticAnalyzer;
      cryptoDetector: CryptoDetector;
      riskScorer: RiskScorer;
    }
  ) {}

  async export(
    format: 'json' | 'markdown',
    options: {
      includeHookData?: boolean;
      includeRecentRequests?: boolean;
    } = {}
  ): Promise<{ json?: SessionReport; markdown?: string }> {
    const report = await this.buildReport(options);

    if (format === 'markdown') {
      return {
        markdown: this.toMarkdown(report)
      };
    }

    return {
      json: report
    };
  }

  private async buildReport(options: {
    includeHookData?: boolean;
    includeRecentRequests?: boolean;
  }): Promise<SessionReport> {
    const files = this.deps.codeCollector.getCollectedFilesSummary();
    const hookStats = this.deps.hookManager.getStats();
    const hookData = options.includeHookData ? await this.readHookData() : null;
    const network = options.includeRecentRequests ? await this.readNetworkSummary() : { includedRecentRequests: false };
    const evidence = await this.readEvidenceSummary();
    const riskSummary = await this.tryBuildRiskSummary();

    const report: SessionReport = {
      collector: {
        files,
        totalFiles: files.length,
        totalSize: files.reduce((total, file) => total + file.size, 0)
      },
      evidence,
      generatedAt: new Date().toISOString(),
      hooks: {
        ...hookStats,
        ...(hookData ? hookData : {})
      },
      network,
      notes: [
        'Phase 6 reports are deterministic snapshots of current runtime state.',
        'Risk scoring is heuristic and should be validated with runtime evidence.'
      ],
      ...(riskSummary ? { riskSummary } : {})
    };

    if (network.recentRequests) {
      report.recentRequests = network.recentRequests;
    }

    return report;
  }

  private async readHookData(): Promise<{
    totalRecords: number;
    recordsByHook: Record<string, number>;
  } | null> {
    try {
      const page = await this.deps.browserSession.getSelectedPage();
      const data = await this.deps.hookManager.getHookData(page);
      const recordsByHook: Record<string, number> = {};
      let totalRecords = 0;

      for (const [hookId, records] of Object.entries(data.records)) {
        recordsByHook[hookId] = records.length;
        totalRecords += records.length;
      }

      return {
        recordsByHook,
        totalRecords
      };
    } catch {
      return null;
    }
  }

  private async readNetworkSummary(): Promise<SessionReport['network']> {
    try {
      const result = await this.deps.networkCollector.listRequests({ limit: 20 });
      const recentRequests = result.requests;
      return {
        includedRecentRequests: true,
        recentRequests,
        suspiciousRequests: recentRequests.filter((request) => this.isSuspiciousRequest(request.method, request.url)).length,
        totalObserved: result.total
      };
    } catch (error) {
      return {
        includedRecentRequests: true,
        warning: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async readEvidenceSummary(): Promise<SessionReport['evidence']> {
    try {
      const entries = await readdir(this.deps.evidenceStore.rootDir, { withFileTypes: true });
      const tasks: SessionReport['evidence']['tasks'] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        try {
          const raw = await readFile(path.join(this.deps.evidenceStore.rootDir, entry.name, 'task.json'), 'utf8');
          const descriptor = JSON.parse(raw) as ReverseTaskDescriptor;
          tasks.push({
            goal: descriptor.goal,
            slug: descriptor.slug,
            targetUrl: descriptor.targetUrl,
            taskId: descriptor.taskId,
            updatedAt: descriptor.updatedAt
          });
        } catch {
          tasks.push({ taskId: entry.name });
        }
      }

      return {
        rootDir: this.deps.evidenceStore.rootDir,
        taskCount: tasks.length,
        tasks: tasks.sort((left, right) => (right.updatedAt ?? '').localeCompare(left.updatedAt ?? ''))
      };
    } catch (error) {
      return {
        rootDir: this.deps.evidenceStore.rootDir,
        taskCount: 0,
        tasks: [],
        warning: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async tryBuildRiskSummary(): Promise<SessionReport['riskSummary'] | undefined> {
    const topFiles = this.deps.codeCollector.getTopPriorityFiles(5);
    if (topFiles.files.length === 0) {
      return undefined;
    }

    const code = topFiles.files.map((file) => file.content).join('\n');
    const [staticAnalysis, crypto] = await Promise.all([
      this.deps.staticAnalyzer.understand({ code, focus: 'all' }),
      this.deps.cryptoDetector.detect({ code })
    ]);

    return this.deps.riskScorer.score({
      crypto,
      staticAnalysis
    });
  }

  private toMarkdown(report: SessionReport): string {
    const lines = [
      '# JSAgent_mcp Session Report',
      '',
      `Generated At: ${report.generatedAt}`,
      '',
      '## Collector',
      '',
      `- Files: ${report.collector.totalFiles}`,
      `- Total Size: ${report.collector.totalSize}`,
      ...report.collector.files.slice(0, 20).map((file) => `- ${file.type}: ${file.url} (${file.size})`),
      '',
      '## Hooks',
      '',
      `- Total Hooks: ${report.hooks.totalHooks}`,
      `- Enabled Hooks: ${report.hooks.enabledHooks}`,
      `- Disabled Hooks: ${report.hooks.disabledHooks}`,
      ...(report.hooks.totalRecords === undefined ? [] : [`- Total Records: ${report.hooks.totalRecords}`]),
      '',
      '## Network',
      '',
      `- Recent Requests Included: ${report.network.includedRecentRequests}`,
      ...(report.network.totalObserved === undefined ? [] : [`- Total Observed: ${report.network.totalObserved}`]),
      ...(report.network.suspiciousRequests === undefined ? [] : [`- Suspicious Recent Requests: ${report.network.suspiciousRequests}`]),
      ...(report.network.warning ? [`- Warning: ${report.network.warning}`] : []),
      '',
      '## Evidence',
      '',
      `- Root: ${report.evidence.rootDir}`,
      `- Tasks: ${report.evidence.taskCount}`,
      ...report.evidence.tasks.slice(0, 10).map((task) => `- ${task.taskId}${task.targetUrl ? ` (${task.targetUrl})` : ''}`),
      '',
      '## Notes',
      '',
      ...(report.notes ?? []).map((note) => `- ${note}`)
    ];

    if (report.riskSummary) {
      lines.splice(
        lines.indexOf('## Notes') - 1,
        0,
        '## Risk Summary',
        '',
        `- Score: ${report.riskSummary.score}`,
        `- Level: ${report.riskSummary.level}`,
        `- Recommendations: ${report.riskSummary.recommendations.join(' | ')}`,
        ''
      );
    }

    return `${lines.join('\n')}\n`;
  }

  private isSuspiciousRequest(method: string, url: string): boolean {
    return /sign|signature|token|auth|api|nonce/i.test(url) || /^(POST|PUT|PATCH)$/i.test(method);
  }
}
