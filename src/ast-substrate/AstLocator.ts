import { parse } from '@babel/parser';
import traverseModule, { type NodePath } from '@babel/traverse';
import * as t from '@babel/types';

import type { ScriptCatalog } from '../source-intel/ScriptCatalog.js';
import type { SourceReader } from '../source-intel/SourceReader.js';
import type { AstFunctionLocation } from './types.js';

const DEFAULT_MAX_RESULTS = 50;
const MAX_RESULTS = 200;
const MAX_SCRIPTS = 30;
const traverse = traverseModule.default;

export class AstLocator {
  constructor(private readonly deps: {
    scriptCatalog: ScriptCatalog;
    sourceReader: SourceReader;
  }) {}

  async locateFunction(options: {
    scriptId?: string;
    urlFilter?: string;
    name?: string;
    text?: string;
    maxResults?: number;
  }): Promise<AstFunctionLocation[]> {
    const limit = clampLimit(options.maxResults);
    const scripts = await this.resolveScripts(options);
    const results: AstFunctionLocation[] = [];

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

      traverse(ast, {
        ArrowFunctionExpression: (path: NodePath<t.ArrowFunctionExpression>) => {
          pushFunction(results, script.scriptId, script.url, source, path, 'arrow-function', options, limit);
        },
        ClassMethod: (path: NodePath<t.ClassMethod>) => {
          pushFunction(results, script.scriptId, script.url, source, path, 'class-method', options, limit);
        },
        FunctionDeclaration: (path: NodePath<t.FunctionDeclaration>) => {
          pushFunction(results, script.scriptId, script.url, source, path, 'function-declaration', options, limit);
        },
        FunctionExpression: (path: NodePath<t.FunctionExpression>) => {
          pushFunction(results, script.scriptId, script.url, source, path, 'function-expression', options, limit);
        },
        ObjectMethod: (path: NodePath<t.ObjectMethod>) => {
          pushFunction(results, script.scriptId, script.url, source, path, 'object-method', options, limit);
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
      const excerpt = await this.deps.sourceReader.get({ scriptId });
      return excerpt.text;
    } catch {
      return null;
    }
  }
}

type FunctionPath =
  | NodePath<t.ArrowFunctionExpression>
  | NodePath<t.ClassMethod>
  | NodePath<t.FunctionDeclaration>
  | NodePath<t.FunctionExpression>
  | NodePath<t.ObjectMethod>;

function pushFunction(
  results: AstFunctionLocation[],
  scriptId: string,
  url: string | undefined,
  source: string,
  path: FunctionPath,
  kind: AstFunctionLocation['kind'],
  options: { name?: string; text?: string },
  limit: number
): void {
  if (results.length >= limit || !path.node.loc) {
    return;
  }
  const functionName = inferFunctionName(path);
  if (options.name && functionName !== options.name) {
    return;
  }
  if (options.text) {
    const start = path.node.start ?? 0;
    const end = path.node.end ?? start;
    if (!source.slice(start, end).includes(options.text)) {
      return;
    }
  }

  results.push({
    scriptId,
    ...(url ? { url } : {}),
    ...(functionName ? { functionName } : {}),
    endColumn: path.node.loc.end.column,
    endLine: path.node.loc.end.line,
    kind,
    startColumn: path.node.loc.start.column,
    startLine: path.node.loc.start.line
  });
}

function inferFunctionName(path: FunctionPath): string | undefined {
  const node = path.node;
  if ((t.isFunctionDeclaration(node) || t.isFunctionExpression(node)) && node.id?.name) {
    return node.id.name;
  }
  if ((t.isObjectMethod(node) || t.isClassMethod(node)) && t.isIdentifier(node.key)) {
    return node.key.name;
  }
  if ((t.isObjectMethod(node) || t.isClassMethod(node)) && t.isStringLiteral(node.key)) {
    return node.key.value;
  }

  const parent = path.parentPath;
  if (parent?.isVariableDeclarator() && t.isIdentifier(parent.node.id)) {
    return parent.node.id.name;
  }
  if (parent?.isAssignmentExpression()) {
    return expressionName(parent.node.left);
  }
  if (parent?.isObjectProperty()) {
    return t.isIdentifier(parent.node.key)
      ? parent.node.key.name
      : t.isStringLiteral(parent.node.key) ? parent.node.key.value : undefined;
  }
  return undefined;
}

function expressionName(node: t.Node): string | undefined {
  if (t.isIdentifier(node)) {
    return node.name;
  }
  if (t.isMemberExpression(node)) {
    const objectName = expressionName(node.object);
    const propertyName = t.isIdentifier(node.property)
      ? node.property.name
      : t.isStringLiteral(node.property) ? node.property.value : undefined;
    return [objectName, propertyName].filter(Boolean).join('.') || undefined;
  }
  return undefined;
}

export function parseSource(source: string): t.File | null {
  try {
    return parse(source, {
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
      errorRecovery: true,
      plugins: [
        'jsx',
        'typescript',
        'classProperties',
        'classPrivateProperties',
        'dynamicImport',
        'importMeta',
        'objectRestSpread',
        'optionalChaining',
        'nullishCoalescingOperator'
      ],
      sourceType: 'unambiguous'
    });
  } catch {
    return null;
  }
}

function clampLimit(value: number | undefined): number {
  if (!Number.isFinite(value ?? DEFAULT_MAX_RESULTS)) {
    return DEFAULT_MAX_RESULTS;
  }
  return Math.max(1, Math.min(MAX_RESULTS, Math.floor(value ?? DEFAULT_MAX_RESULTS)));
}
