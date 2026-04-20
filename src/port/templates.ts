import type { NodePureScaffold, PureFixture } from '../pure/types.js';

function quoteList(items: string[]): string {
  return items.length > 0 ? items.join(', ') : '(none)';
}

export function buildPythonImplCode(fixture: PureFixture): string {
  return `"""JSAgent_mcp Python pure scaffold.

This file is intentionally scaffold-first. It mirrors the Node pure boundary
contract but does not claim to be a completed port until verify_python_pure
passes with a real implementation.
"""


def compute_pure(input_data, ctx=None):
    """Compute the portable result for the fixture boundary.

    Boundary summary:
    - explicitInputs: ${quoteList(fixture.boundary.explicitInputs)}
    - derivedInputs: ${quoteList(fixture.boundary.derivedInputs)}
    - environmentState: ${quoteList(fixture.boundary.environmentState)}
    - outputs: ${quoteList(fixture.boundary.outputs)}
    """
    ctx = ctx or {}
    input_data = input_data or {}
    return {
        "status": "scaffold",
        "inputKeys": sorted(input_data.keys()),
        "boundaryOutputs": list(ctx.get("boundary", {}).get("outputs", [])),
    }
`;
}

export function buildPythonEntryCode(): string {
  return `import json
import os
import sys
import traceback
from pathlib import Path

from pure_impl import compute_pure


def main():
    fixture_path = Path(os.environ.get("JSAGENT_PYTHON_FIXTURE", Path(__file__).with_name("fixtures.json")))
    try:
        fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
        result = compute_pure(
            fixture.get("input") or {},
            {
                "boundary": fixture.get("boundary") or {},
                "derived": fixture.get("derived") or {},
                "environmentState": ((fixture.get("context") or {}).get("environmentState") or {}),
                "expectedOutput": fixture.get("expectedOutput"),
                "intermediates": fixture.get("intermediates"),
            },
        )
        print(json.dumps({"__jsagent_python_result__": result}, ensure_ascii=False))
    except Exception as exc:
        print(
            json.dumps(
                {
                    "__jsagent_python_error__": {
                        "name": exc.__class__.__name__,
                        "message": str(exc),
                        "stack": traceback.format_exc(),
                    }
                },
                ensure_ascii=False,
            ),
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
`;
}

export function buildPythonReadme(nodePure: NodePureScaffold, fixture: PureFixture): string {
  return `# JSAgent_mcp Python Pure Scaffold

This scaffold is generated from the Node pure baseline.

## Source

- Node entry: ${nodePure.entryFile}
- Fixture boundary outputs: ${quoteList(fixture.boundary.outputs)}

## Rule

Use the same \`fixtures.json\` input contract as Node pure. Do not add browser
state or page dumps to Python input. If \`verify_python_pure\` diverges, fix the
first divergence before SDK wrapping.
`;
}
