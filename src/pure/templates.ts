import type { PureBoundary, PureFixture } from './types.js';
import { toJsonLiteral } from './serialization.js';

export function buildPureImplCode(boundary: PureBoundary): string {
  return `export function computePure(input, ctx = {}) {
  /*
   * JSAgent_mcp pure scaffold.
   * Boundary summary:
   * explicitInputs: ${boundary.explicitInputs.join(', ') || '(none)'}
   * derivedInputs: ${boundary.derivedInputs.join(', ') || '(none)'}
   * environmentState: ${boundary.environmentState.join(', ') || '(none)'}
   * outputs: ${boundary.outputs.join(', ') || '(none)'}
   *
   * This scaffold intentionally does not pretend to be a completed pure
   * implementation. Replace this deterministic placeholder with the extracted
   * algorithm, then rerun verify_node_pure.
   */
  return {
    status: 'scaffold',
    inputKeys: Object.keys(input || {}).sort(),
    boundaryOutputs: ${toJsonLiteral(boundary.outputs)}
  };
}
`;
}

export function buildPureEntryCode(fixture: PureFixture): string {
  return `import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computePure } from './pure-impl.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = process.env.JSAGENT_PURE_FIXTURE || path.join(__dirname, 'fixtures.json');

try {
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  const result = await computePure(fixture.input ?? {}, {
    boundary: fixture.boundary,
    derived: fixture.derived ?? {},
    environmentState: fixture.context?.environmentState ?? {},
    expectedOutput: fixture.expectedOutput,
    intermediates: fixture.intermediates ?? null
  });
  console.log(JSON.stringify({ __jsagent_pure_result__: result }));
} catch (error) {
  console.error(JSON.stringify({
    __jsagent_pure_error__: {
      name: error && error.name ? error.name : 'Error',
      message: error && error.message ? error.message : String(error),
      stack: error && error.stack ? error.stack : undefined
    }
  }));
  process.exitCode = 1;
}
`;
}

export function buildPureReadme(boundary: PureBoundary): string {
  return `# JSAgent_mcp Node Pure Scaffold

This directory is a deterministic Node scaffold for a future pure implementation.

## Boundary

- Explicit inputs: ${boundary.explicitInputs.join(', ') || '(none)'}
- Derived inputs: ${boundary.derivedInputs.join(', ') || '(none)'}
- Environment state: ${boundary.environmentState.join(', ') || '(none)'}
- Intermediates: ${boundary.intermediates.join(', ') || '(none)'}
- Outputs: ${boundary.outputs.join(', ') || '(none)'}

## Rule

Do not port this to another language until \`verify_node_pure\` passes against the frozen fixture.
`;
}
