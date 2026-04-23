import traverse, { type NodePath } from '@babel/traverse';
import * as t from '@babel/types';

import type { ScriptCatalog } from '../source-intel/ScriptCatalog.js';
import type { SourceReader } from '../source-intel/SourceReader.js';
import { parseSource } from './AstLocator.js';
import type { AstReferenceMatch } from './types.js';

const DEFAULT_MAX_RESULTS = 100;
const MAX_RESULTS = 500;
const MAX_SCRIPTS = 40;

export class AstReferenceFinder {
  constructor(private readonly deps: {
    scriptCatalog: ScriptCatalog;
    sourceReader: SourceReader;
  }) {}

  async findReferences(options: {
    query: string;
    scriptId?: string;
    urlFilter?: string;
    maxResults?: number;
  }): Promise<AstReferenceMatch[]> {
    const query = options.query.trim();
    if (!query) {
      return [];
    }
    const limit = clampLimit(options.maxResults);
    const scripts = await this.resolveScripts(options);
    const results: AstReferenceMatch[] = [];

    for (const script of scripts) {
      if (results.length >= limit) {
        break;
      }
      const source = await this.readSource(script.scriptId);
      if (!source) {
        continue;
      }
      const ast = parseSource(source);
      if (!ast) {
        continue;
      }
      const queryParts = query.split('.').filter(Boolean);
      const lastPart = queryParts.at(-1) ?? query;

      traverse(ast, {
        Identifier: (path) => {
          if (path.node.name !== query && path.node.name !== lastPart) {
            return;
          }
          if (path.parentPath.isMemberExpression() && path.parentPath.node.property === path.node) {
            return;
          }
          pushMatch(results, script.scriptId, script.url, source, path, classifyIdentifier(path), limit);
        },
        MemberExpression: (path) => {
          const memberName = memberExpressionName(path.node);
          if (memberName !== query && propertyName(path.node.property) !== query && propertyName(path.node.property) !== lastPart) {
            return;
          }
          pushMatch(results, script.scriptId, script.url, source, path, classifyMember(path), limit);
        }
      });
    }

    return results.slice(0, limit);
  }

  private async resolveScripts(options: { scriptId?: string; urlFilter?: string }) {
    const scripts = await this.deps.scriptCatalog.list({
      filter: options.scriptId ?? options.urlFilter
    });
    return scripts
      .filter((script) => !options.scriptId || script.scriptId === options.scriptId)
      .filter((script) => !options.urlFilter || (script.url ?? '').includes(options.urlFilter))
      .slice(0, MAX_SCRIPTS);
  }

  private async readSource(scriptId: string): Promise<string | null> {
    try {
      return (await this.deps.sourceReader.get({ scriptId })).text;
    } catch {
      return null;
    }
  }
}

function classifyIdentifier(path: NodePath<t.Identifier>): AstReferenceMatch['kind'] {
  if (path.parentPath.isCallExpression() && path.parentPath.node.callee === path.node) {
    return 'callsite';
  }
  if (path.parentPath.isAssignmentExpression() && path.parentPath.node.left === path.node) {
    return 'assignment';
  }
  return 'identifier';
}

function classifyMember(path: NodePath<t.MemberExpression>): AstReferenceMatch['kind'] {
  if (path.parentPath.isCallExpression() && path.parentPath.node.callee === path.node) {
    return 'callsite';
  }
  if (path.parentPath.isAssignmentExpression() && path.parentPath.node.left === path.node) {
    return 'property-write';
  }
  if (path.parentPath.isUpdateExpression()) {
    return 'property-write';
  }
  return 'property-read';
}

function pushMatch(
  results: AstReferenceMatch[],
  scriptId: string,
  url: string | undefined,
  source: string,
  path: NodePath<t.Node>,
  kind: AstReferenceMatch['kind'],
  limit: number
): void {
  if (results.length >= limit || !path.node.loc) {
    return;
  }
  results.push({
    scriptId,
    ...(url ? { url } : {}),
    columnNumber: path.node.loc.start.column,
    contextPreview: linePreview(source, path.node.loc.start.line),
    kind,
    lineNumber: path.node.loc.start.line
  });
}

function memberExpressionName(node: t.MemberExpression): string {
  const left = expressionName(node.object);
  const right = propertyName(node.property);
  return [left, right].filter(Boolean).join('.');
}

function expressionName(node: t.Node): string | undefined {
  if (t.isIdentifier(node)) {
    return node.name;
  }
  if (t.isThisExpression(node)) {
    return 'this';
  }
  if (t.isSuper(node)) {
    return 'super';
  }
  if (t.isMemberExpression(node)) {
    return memberExpressionName(node);
  }
  return undefined;
}

function propertyName(node: t.Node): string | undefined {
  if (t.isIdentifier(node)) {
    return node.name;
  }
  if (t.isStringLiteral(node) || t.isNumericLiteral(node)) {
    return String(node.value);
  }
  return undefined;
}

function linePreview(source: string, lineNumber: number): string {
  const line = source.split(/\r?\n/)[Math.max(0, lineNumber - 1)] ?? '';
  const trimmed = line.trim();
  return trimmed.length > 240 ? `${trimmed.slice(0, 240)}...[truncated]` : trimmed;
}

function clampLimit(value: number | undefined): number {
  if (!Number.isFinite(value ?? DEFAULT_MAX_RESULTS)) {
    return DEFAULT_MAX_RESULTS;
  }
  return Math.max(1, Math.min(MAX_RESULTS, Math.floor(value ?? DEFAULT_MAX_RESULTS)));
}
