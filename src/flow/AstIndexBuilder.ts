import * as ts from 'typescript';

import type { CodeCollector } from '../collector/CodeCollector.js';
import type {
  AstAssignmentEntry,
  AstCallEntry,
  AstFunctionEntry,
  AstPropertyReadEntry,
  AstPropertyWriteEntry,
  LightweightAstIndex
} from './types.js';

const DEFAULT_TOP_FILES = 8;
const MAX_FILES = 12;
const MAX_ITEMS_PER_KIND = 300;
const PREVIEW_LIMIT = 180;

export class AstIndexBuilder {
  constructor(private readonly codeCollector: CodeCollector) {}

  async buildForFiles(files: string[]): Promise<LightweightAstIndex> {
    const requestedFiles = uniqueStrings(files).slice(0, MAX_FILES);
    const fallbackFiles =
      requestedFiles.length > 0
        ? []
        : this.codeCollector.getTopPriorityFiles(DEFAULT_TOP_FILES).files.map((file) => file.url);
    const targetFiles = requestedFiles.length > 0 ? requestedFiles : fallbackFiles;

    const index: LightweightAstIndex = {
      assignments: [],
      calls: [],
      files: [],
      functions: [],
      notes: [],
      propertyReads: [],
      propertyWrites: []
    };

    for (const fileName of targetFiles) {
      const file = this.codeCollector.getFileByUrl(fileName);
      if (!file) {
        index.notes.push(`No collected code body was available for ${fileName}; AST indexing skipped this file.`);
        continue;
      }

      this.indexFile(file.url, file.content, index);
    }

    index.functions = dedupeBy(index.functions, (item) => `${item.file}:${item.lineNumber}:${item.name}`).slice(0, MAX_ITEMS_PER_KIND);
    index.assignments = dedupeBy(index.assignments, (item) => `${item.file}:${item.lineNumber}:${item.target}:${item.valuePreview ?? ''}`).slice(0, MAX_ITEMS_PER_KIND);
    index.propertyWrites = dedupeBy(index.propertyWrites, (item) => `${item.file}:${item.lineNumber}:${item.objectName ?? ''}.${item.property}:${item.valuePreview ?? ''}`).slice(0, MAX_ITEMS_PER_KIND);
    index.propertyReads = dedupeBy(index.propertyReads, (item) => `${item.file}:${item.lineNumber}:${item.objectName ?? ''}.${item.property}`).slice(0, MAX_ITEMS_PER_KIND);
    index.calls = dedupeBy(index.calls, (item) => `${item.file}:${item.lineNumber}:${item.callee}:${item.argsPreview.join('|')}`).slice(0, MAX_ITEMS_PER_KIND);

    if (index.files.length === 0) {
      index.notes.push('No files were indexed; run collect_code or a scenario/capture workflow before flow reasoning when runtime source is used.');
    }

    return index;
  }

  private indexFile(file: string, content: string, index: LightweightAstIndex): void {
    const sourceFile = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true,
      this.scriptKindFor(file)
    );
    index.files.push(file);

    const visit = (node: ts.Node, functionName: string | undefined): void => {
      const nextFunctionName = this.functionNameFor(node, sourceFile) ?? functionName;
      if (nextFunctionName && nextFunctionName !== functionName) {
        this.pushFunction(index.functions, {
          file,
          lineNumber: this.lineNumber(sourceFile, node),
          name: nextFunctionName
        });
      }

      if (ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken.kind)) {
        const assignment = this.assignmentFromBinary(file, sourceFile, node, nextFunctionName);
        this.pushAssignment(index.assignments, assignment);

        const propertyWrite = this.propertyWriteFromExpression(
          file,
          sourceFile,
          node.left,
          node.right,
          nextFunctionName
        );
        if (propertyWrite) {
          this.pushPropertyWrite(index.propertyWrites, propertyWrite);
        }
      }

      if (ts.isCallExpression(node)) {
        this.pushCall(index.calls, {
          argsPreview: node.arguments.map((argument) => compactText(argument.getText(sourceFile))),
          callee: compactText(node.expression.getText(sourceFile)),
          file,
          functionName: nextFunctionName,
          lineNumber: this.lineNumber(sourceFile, node)
        });
      }

      const propertyRead = this.propertyReadFromExpression(file, sourceFile, node, nextFunctionName);
      if (propertyRead) {
        this.pushPropertyRead(index.propertyReads, propertyRead);
      }

      ts.forEachChild(node, (child) => visit(child, nextFunctionName));
    };

    visit(sourceFile, undefined);
  }

  private assignmentFromBinary(
    file: string,
    sourceFile: ts.SourceFile,
    node: ts.BinaryExpression,
    functionName: string | undefined
  ): AstAssignmentEntry {
    return {
      file,
      functionName,
      lineNumber: this.lineNumber(sourceFile, node),
      target: compactText(node.left.getText(sourceFile)),
      valuePreview: compactText(node.right.getText(sourceFile))
    };
  }

  private propertyWriteFromExpression(
    file: string,
    sourceFile: ts.SourceFile,
    expression: ts.Expression,
    value: ts.Expression,
    functionName: string | undefined
  ): AstPropertyWriteEntry | null {
    const property = propertyParts(expression, sourceFile);
    if (!property) {
      return null;
    }

    return {
      file,
      functionName,
      lineNumber: this.lineNumber(sourceFile, expression),
      objectName: property.objectName,
      property: property.property,
      valuePreview: compactText(value.getText(sourceFile))
    };
  }

  private propertyReadFromExpression(
    file: string,
    sourceFile: ts.SourceFile,
    node: ts.Node,
    functionName: string | undefined
  ): AstPropertyReadEntry | null {
    if (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) {
      return null;
    }
    if (isAssignmentWriteTarget(node)) {
      return null;
    }

    const property = propertyParts(node, sourceFile);
    if (!property) {
      return null;
    }

    return {
      file,
      functionName,
      lineNumber: this.lineNumber(sourceFile, node),
      objectName: property.objectName,
      property: property.property
    };
  }

  private functionNameFor(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
    if (ts.isFunctionDeclaration(node) && node.name) {
      return node.name.text;
    }

    if ((ts.isFunctionExpression(node) || ts.isArrowFunction(node)) && ts.isVariableDeclaration(node.parent)) {
      return compactText(node.parent.name.getText(sourceFile));
    }

    if ((ts.isFunctionExpression(node) || ts.isArrowFunction(node)) && ts.isPropertyAssignment(node.parent)) {
      return propertyNameText(node.parent.name, sourceFile);
    }

    if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) {
      return propertyNameText(node.name, sourceFile);
    }

    return undefined;
  }

  private lineNumber(sourceFile: ts.SourceFile, node: ts.Node): number {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  }

  private scriptKindFor(file: string): ts.ScriptKind {
    if (/\.tsx(?:$|[?#])/i.test(file)) {
      return ts.ScriptKind.TSX;
    }
    if (/\.ts(?:$|[?#])/i.test(file)) {
      return ts.ScriptKind.TS;
    }
    if (/\.jsx(?:$|[?#])/i.test(file)) {
      return ts.ScriptKind.JSX;
    }
    return ts.ScriptKind.JS;
  }

  private pushFunction(items: AstFunctionEntry[], item: AstFunctionEntry): void {
    if (items.length < MAX_ITEMS_PER_KIND) {
      items.push(item);
    }
  }

  private pushAssignment(items: AstAssignmentEntry[], item: AstAssignmentEntry): void {
    if (items.length < MAX_ITEMS_PER_KIND) {
      items.push(item);
    }
  }

  private pushPropertyWrite(items: AstPropertyWriteEntry[], item: AstPropertyWriteEntry): void {
    if (items.length < MAX_ITEMS_PER_KIND) {
      items.push(item);
    }
  }

  private pushPropertyRead(items: AstPropertyReadEntry[], item: AstPropertyReadEntry): void {
    if (items.length < MAX_ITEMS_PER_KIND) {
      items.push(item);
    }
  }

  private pushCall(items: AstCallEntry[], item: AstCallEntry): void {
    if (items.length < MAX_ITEMS_PER_KIND) {
      items.push(item);
    }
  }
}

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return kind === ts.SyntaxKind.EqualsToken ||
    kind === ts.SyntaxKind.PlusEqualsToken ||
    kind === ts.SyntaxKind.MinusEqualsToken ||
    kind === ts.SyntaxKind.AsteriskEqualsToken ||
    kind === ts.SyntaxKind.SlashEqualsToken ||
    kind === ts.SyntaxKind.PercentEqualsToken ||
    kind === ts.SyntaxKind.AmpersandEqualsToken ||
    kind === ts.SyntaxKind.BarEqualsToken ||
    kind === ts.SyntaxKind.CaretEqualsToken ||
    kind === ts.SyntaxKind.LessThanLessThanEqualsToken ||
    kind === ts.SyntaxKind.GreaterThanGreaterThanEqualsToken ||
    kind === ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken ||
    kind === ts.SyntaxKind.AsteriskAsteriskEqualsToken ||
    kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken ||
    kind === ts.SyntaxKind.BarBarEqualsToken ||
    kind === ts.SyntaxKind.QuestionQuestionEqualsToken;
}

function isAssignmentWriteTarget(node: ts.Node): boolean {
  const parent = node.parent;
  return Boolean(parent && ts.isBinaryExpression(parent) && parent.left === node && isAssignmentOperator(parent.operatorToken.kind));
}

function propertyParts(
  node: ts.Node,
  sourceFile: ts.SourceFile
): { objectName?: string; property: string } | null {
  if (ts.isPropertyAccessExpression(node)) {
    return {
      objectName: compactText(node.expression.getText(sourceFile)),
      property: node.name.text
    };
  }

  if (ts.isElementAccessExpression(node)) {
    const argument = node.argumentExpression;
    if (!argument) {
      return null;
    }
    const raw = argument.getText(sourceFile);
    const property = raw.replace(/^['"`]|['"`]$/g, '');
    if (!property || property.length > 120) {
      return null;
    }
    return {
      objectName: compactText(node.expression.getText(sourceFile)),
      property
    };
  }

  return null;
}

function propertyNameText(name: ts.PropertyName, sourceFile: ts.SourceFile): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return compactText(name.getText(sourceFile));
}

function compactText(value: string): string {
  const compacted = value.replace(/\s+/g, ' ').trim();
  return compacted.length > PREVIEW_LIMIT ? `${compacted.slice(0, PREVIEW_LIMIT - 3)}...` : compacted;
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function dedupeBy<T>(items: readonly T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}
