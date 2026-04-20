import type { CodeFile, RankedCodeFile } from './types.js';

const POSITIVE_URL_KEYWORDS = ['sign', 'encrypt', 'crypto', 'api', 'request', 'main', 'app', 'core'] as const;
const NEGATIVE_URL_KEYWORDS = ['vendor', 'lib', 'react', 'vue', 'jquery', 'node_modules'] as const;

function scoreFileSize(size: number): { score: number; reason: string } {
  if (size <= 2_000) {
    return { reason: 'small-file', score: 18 };
  }

  if (size <= 10_000) {
    return { reason: 'medium-small-file', score: 12 };
  }

  if (size <= 50_000) {
    return { reason: 'medium-file', score: 6 };
  }

  if (size <= 120_000) {
    return { reason: 'large-file', score: 0 };
  }

  return { reason: 'very-large-file', score: -8 };
}

export function rankCodeFiles(files: readonly CodeFile[]): RankedCodeFile[] {
  const ranked = files.map<RankedCodeFile>((file) => {
    const reasons: string[] = [];
    let score = 0;

    if (file.type === 'inline') {
      score += 24;
      reasons.push('inline-preferred');
    } else {
      score += 8;
      reasons.push('external-baseline');
    }

    const sizeScore = scoreFileSize(file.size);
    score += sizeScore.score;
    reasons.push(sizeScore.reason);

    const normalizedUrl = file.url.toLowerCase();
    for (const keyword of POSITIVE_URL_KEYWORDS) {
      if (normalizedUrl.includes(keyword)) {
        score += 10;
        reasons.push(`url+${keyword}`);
      }
    }

    for (const keyword of NEGATIVE_URL_KEYWORDS) {
      if (normalizedUrl.includes(keyword)) {
        score -= 10;
        reasons.push(`url-${keyword}`);
      }
    }

    return {
      ...file,
      reasons,
      score
    };
  });

  return ranked.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    if (left.size !== right.size) {
      return left.size - right.size;
    }

    return left.url.localeCompare(right.url);
  });
}
