import type { RegressionBaseline } from '../regression/types.js';

export function buildNodePackageJson(): Record<string, unknown> {
  return {
    name: 'jsagent-delivery-node',
    version: '0.1.0',
    type: 'module',
    main: './index.mjs'
  };
}

export function buildNodeIndex(): string {
  return `import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function loadContract() {
  return JSON.parse(await readFile(path.join(__dirname, 'contract.json'), 'utf8'));
}

export async function loadFixtures() {
  return JSON.parse(await readFile(path.join(__dirname, 'fixtures.json'), 'utf8'));
}
`;
}

export function buildPythonInit(): string {
  return `from .client import load_contract, load_fixtures

__all__ = ["load_contract", "load_fixtures"]
`;
}

export function buildPythonClient(): string {
  return `import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def load_contract():
    return json.loads((ROOT / "contract.json").read_text(encoding="utf-8"))


def load_fixtures():
    return json.loads((ROOT / "fixtures.json").read_text(encoding="utf-8"))
`;
}

export function buildSdkReadme(input: {
  baseline: RegressionBaseline;
  target: 'node' | 'python' | 'dual';
}): string {
  return `# JSAgent_mcp Delivery SDK Package

Target: ${input.target}

Baseline: ${input.baseline.baselineId}

This is a minimal fixture-bound delivery package. It is not automatically
published to npm or PyPI and does not attempt to generate a full SDK platform.

## Contract

- Explicit inputs: ${input.baseline.contractSummary?.explicitInputs.join(', ') || '(none)'}
- Outputs: ${input.baseline.contractSummary?.outputs.join(', ') || '(none)'}

Keep regression passing before changing the exported contract.
`;
}
