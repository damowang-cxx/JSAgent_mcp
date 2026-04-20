import type { AnalyzeTargetRunner } from '../workflow/AnalyzeTargetRunner.js';
import type { FixtureExtractor } from '../rebuild/FixtureExtractor.js';
import type { RuntimeFixture } from '../rebuild/types.js';
import type { FixtureStabilizationResult, FixtureStabilityResult } from './types.js';

export class FixtureStabilizer {
  constructor(
    private readonly deps: {
      fixtureExtractor: FixtureExtractor;
      analyzeTargetRunner: AnalyzeTargetRunner;
    }
  ) {}

  async stabilize(options: {
    source: 'current-page' | 'analyze-target-last';
    samples?: number;
    suspiciousRequestLimit?: number;
  }): Promise<FixtureStabilizationResult> {
    const sampleCount = Math.max(2, Math.min(options.samples ?? 3, 5));
    const fixtures: RuntimeFixture[] = [];

    for (let index = 0; index < sampleCount; index += 1) {
      fixtures.push(await this.extract(options.source, options.suspiciousRequestLimit));
    }

    return {
      fixtures,
      stability: this.compare(fixtures)
    };
  }

  private async extract(source: 'current-page' | 'analyze-target-last', suspiciousRequestLimit?: number): Promise<RuntimeFixture> {
    const lastAnalyze = this.deps.analyzeTargetRunner.getLastAnalyzeTargetResult();
    if (source === 'analyze-target-last' && lastAnalyze) {
      return this.deps.fixtureExtractor.extractFromAnalyzeTargetResult(lastAnalyze);
    }

    return this.deps.fixtureExtractor.extractFromCurrentPage({
      analyzeTargetResult: lastAnalyze,
      maxRequests: suspiciousRequestLimit
    });
  }

  private compare(fixtures: RuntimeFixture[]): FixtureStabilityResult {
    const base = fixtures[0];
    const mismatches: FixtureStabilityResult['mismatches'] = [];

    if (!base) {
      return {
        comparedSamples: 0,
        mismatches: [],
        notes: ['No fixture samples were available.'],
        stable: false
      };
    }

    this.compareField(mismatches, fixtures, 'requestSamples', (fixture) =>
      fixture.requestSamples.map((request) => `${request.method} ${normalizeUrl(request.url)}`).join('|')
    );
    this.compareField(mismatches, fixtures, 'hookSamples', (fixture) =>
      fixture.hookSamples.map((sample) => `${sample.hookId}:${sample.target ?? ''}`).join('|')
    );
    this.compareField(mismatches, fixtures, 'selectedPriorityTargets', (fixture) =>
      (fixture.selectedPriorityTargets ?? []).join('|')
    );

    const stable = mismatches.length === 0;
    return {
      comparedSamples: fixtures.length,
      mismatches,
      notes: [
        stable
          ? 'Fixture samples are stable enough for the next patch/pure-extraction step.'
          : 'Fixture samples drifted; avoid treating one sample as a stable pure-extraction boundary.'
      ],
      stable
    };
  }

  private compareField(
    mismatches: FixtureStabilityResult['mismatches'],
    fixtures: RuntimeFixture[],
    field: string,
    selector: (fixture: RuntimeFixture) => string
  ): void {
    const values = fixtures.map(selector);
    const base = values[0];
    const differing = values.filter((value) => value !== base);
    if (differing.length > 0) {
      mismatches.push({
        count: differing.length,
        examples: Array.from(new Set(values)).slice(0, 3),
        field
      });
    }
  }
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url.replace(/[?#].*$/, '');
  }
}
