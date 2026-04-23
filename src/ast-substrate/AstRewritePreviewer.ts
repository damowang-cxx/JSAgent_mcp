import generate from '@babel/generator';
import traverse from '@babel/traverse';
import * as t from '@babel/types';

import type { ScriptCatalog } from '../source-intel/ScriptCatalog.js';
import type { SourceReader } from '../source-intel/SourceReader.js';
import { parseSource } from './AstLocator.js';
import type { AstRewritePreview } from './types.js';

const MAX_PREVIEW_CHARS = 20_000;

export class AstRewritePreviewer {
  constructor(private readonly deps: {
    scriptCatalog: ScriptCatalog;
    sourceReader: SourceReader;
  }) {}

  async preview(options: {
    scriptId: string;
    rewriteKind: AstRewritePreview['rewriteKind'];
    target?: string;
  }): Promise<AstRewritePreview> {
    const source = await this.deps.sourceReader.get({ scriptId: options.scriptId });
    const script = (await this.deps.scriptCatalog.list()).find((item) => item.scriptId === options.scriptId);
    const notes = [
      'AST rewrite preview is deterministic and read-only; it does not apply patches to the page or collected code.'
    ];
    const ast = parseSource(source.text);
    if (!ast) {
      return boundedPreview({
        notes: [...notes, 'Source could not be parsed by the bounded Babel parser; original bounded source excerpt was returned.'],
        preview: source.text,
        rewriteKind: options.rewriteKind,
        scriptId: options.scriptId,
        url: script?.url
      });
    }

    switch (options.rewriteKind) {
      case 'pretty-print':
        notes.push('Pretty-print preview generated from AST with comments preserved where parser retained them.');
        break;
      case 'normalize-member-access':
        normalizeMemberAccess(ast);
        notes.push('Computed string member accesses that are valid identifiers were normalized to dot form.');
        break;
      case 'rename-local':
        renameLocal(ast, options.target, notes);
        break;
      case 'inline-constant':
        inlineConstant(ast, options.target, notes);
        break;
    }

    const generated = generate(ast, {
      comments: true,
      compact: false,
      jsescOption: { minimal: true },
      retainLines: false
    }, source.text).code;

    return boundedPreview({
      notes,
      preview: generated,
      rewriteKind: options.rewriteKind,
      scriptId: options.scriptId,
      url: script?.url
    });
  }
}

function normalizeMemberAccess(ast: t.File): void {
  traverse(ast, {
    MemberExpression(path) {
      if (!path.node.computed || !t.isStringLiteral(path.node.property)) {
        return;
      }
      const property = path.node.property.value;
      if (/^[A-Za-z_$][\w$]*$/.test(property)) {
        path.node.property = t.identifier(property);
        path.node.computed = false;
      }
    }
  });
}

function renameLocal(ast: t.File, target: string | undefined, notes: string[]): void {
  const parsed = parseRenameTarget(target);
  if (!parsed) {
    notes.push('rename-local expects target in "oldName:newName" form; no rename was applied.');
    return;
  }
  let renamed = false;
  traverse(ast, {
    Program(path) {
      if (path.scope.hasBinding(parsed.from)) {
        path.scope.rename(parsed.from, parsed.to);
        renamed = true;
      }
    },
    Scope(path) {
      if (!renamed && path.scope.hasOwnBinding(parsed.from)) {
        path.scope.rename(parsed.from, parsed.to);
        renamed = true;
      }
    }
  });
  notes.push(renamed
    ? `Renamed one lexical binding from ${parsed.from} to ${parsed.to} in preview only.`
    : `No local binding named ${parsed.from} was found for rename preview.`);
}

function inlineConstant(ast: t.File, target: string | undefined, notes: string[]): void {
  const name = target?.trim();
  if (!name) {
    notes.push('inline-constant expects target to be a constant identifier; no inline was applied.');
    return;
  }

  let literal: t.Expression | null = null;
  traverse(ast, {
    VariableDeclarator(path) {
      if (literal || !t.isIdentifier(path.node.id) || path.node.id.name !== name) {
        return;
      }
      if (t.isStringLiteral(path.node.init) || t.isNumericLiteral(path.node.init) || t.isBooleanLiteral(path.node.init) || t.isNullLiteral(path.node.init)) {
        literal = t.cloneNode(path.node.init);
      }
    }
  });

  if (!literal) {
    notes.push(`No simple literal constant named ${name} was found for inline preview.`);
    return;
  }

  let replacements = 0;
  traverse(ast, {
    Identifier(path) {
      if (path.node.name !== name || path.isBindingIdentifier()) {
        return;
      }
      if (path.parentPath.isMemberExpression() && path.parentPath.node.property === path.node && !path.parentPath.node.computed) {
        return;
      }
      path.replaceWith(t.cloneNode(literal as t.Expression));
      replacements += 1;
    }
  });
  notes.push(`Preview inlined ${replacements} simple identifier reference(s) for ${name}.`);
}

function parseRenameTarget(target: string | undefined): { from: string; to: string } | null {
  const [from, to] = (target ?? '').split(':').map((part) => part.trim());
  if (!from || !to || !/^[A-Za-z_$][\w$]*$/.test(from) || !/^[A-Za-z_$][\w$]*$/.test(to)) {
    return null;
  }
  return { from, to };
}

function boundedPreview(input: AstRewritePreview): AstRewritePreview {
  if (input.preview.length <= MAX_PREVIEW_CHARS) {
    return {
      ...input,
      truncated: false
    };
  }
  return {
    ...input,
    notes: [...input.notes, `Preview truncated to ${MAX_PREVIEW_CHARS} characters.`],
    preview: input.preview.slice(0, MAX_PREVIEW_CHARS),
    truncated: true
  };
}
