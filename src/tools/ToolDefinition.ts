import type { z } from 'zod';

import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import type { AppRuntime } from '../runtime/AppRuntime.js';
import type { ToolCategory } from './categories.js';
import type { ToolRegistry } from './ToolRegistry.js';

export type ToolResult = Record<string, unknown>;

export type ToolContext = {
  browserSession: BrowserSessionManager;
  runtime: AppRuntime;
  serverStartedAt: Date;
  registry: ToolRegistry;
  serverName: string;
  serverVersion: string;
};

export type ToolAnnotations = {
  category: ToolCategory;
  readOnlyHint: boolean;
};

export type ToolDefinition<TParams extends object = Record<string, unknown>> = {
  name: string;
  description: string;
  annotations: ToolAnnotations;
  schema: z.ZodObject<z.ZodRawShape>;
  handler: (request: { params: TParams }, context: ToolContext) => ToolResult | Promise<ToolResult>;
};

export type RegisteredToolDefinition = Omit<ToolDefinition, 'handler'> & {
  handler: (
    request: { params: Record<string, unknown> },
    context: ToolContext
  ) => ToolResult | Promise<ToolResult>;
};

export function defineTool<TParams extends object>(
  definition: ToolDefinition<TParams>
): RegisteredToolDefinition {
  return definition as unknown as RegisteredToolDefinition;
}
