import type { RegressionBaseline } from '../regression/types.js';

export function buildNodePackageJson(): Record<string, unknown> {
  return {
    name: 'jsagent-delivery-node',
    version: '0.1.0',
    type: 'module',
    main: './index.mjs'
  };
}

export function buildNodeIndex(input: {
  hasImpl: boolean;
}): string {
  return `import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
${input.hasImpl ? "import { computePure } from './pure-impl.js';" : ''}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export async function loadContract() {
  return JSON.parse(await readFile(path.join(ROOT, 'contract.json'), 'utf8'));
}

export async function loadFixtures() {
  return JSON.parse(await readFile(path.join(ROOT, 'fixtures.json'), 'utf8'));
}

${input.hasImpl ? `export async function compute(input, ctx = {}) {
  return await computePure(input, ctx);
}

export async function computeFromFixture() {
  const fixture = await loadFixtures();
  return await computePure(fixture.input ?? {}, {
    boundary: fixture.boundary,
    derived: fixture.derived ?? {},
    environmentState: fixture.context?.environmentState ?? {},
    expectedOutput: fixture.expectedOutput,
    intermediates: fixture.intermediates ?? null
  });
}` : `export async function compute() {
  throw new Error('pure-impl.js was not packaged, so this SDK package is not callable.');
}`}
`;
}

export function buildPythonInit(): string {
  return `from .client import load_contract, load_fixtures

__all__ = ["load_contract", "load_fixtures"]
`;
}

export function buildPythonClient(input: {
  hasImpl: boolean;
}): string {
  return `import json
from pathlib import Path
${input.hasImpl ? 'from .pure_impl import compute_pure' : ''}


ROOT = Path(__file__).resolve().parent.parent


def load_contract():
    return json.loads((ROOT / "contract.json").read_text(encoding="utf-8"))


def load_fixtures():
    return json.loads((ROOT / "fixtures.json").read_text(encoding="utf-8"))
${input.hasImpl ? `


def compute(input_data, ctx=None):
    return compute_pure(input_data, ctx or {})


def compute_from_fixture():
    fixture = load_fixtures()
    return compute_pure(
        fixture.get("input") or {},
        {
            "boundary": fixture.get("boundary") or {},
            "derived": fixture.get("derived") or {},
            "environmentState": ((fixture.get("context") or {}).get("environmentState") or {}),
            "expectedOutput": fixture.get("expectedOutput"),
            "intermediates": fixture.get("intermediates"),
        },
    )
` : `


def compute(input_data, ctx=None):
    raise RuntimeError("pure_impl.py was not packaged, so this SDK package is not callable.")
`}
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
