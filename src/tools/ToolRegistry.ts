import { AppError } from '../core/errors.js';
import type { RegisteredToolDefinition } from './ToolDefinition.js';

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredToolDefinition>();
  private readonly aliases = new Map<string, string>();

  register(tool: RegisteredToolDefinition): void {
    if (this.tools.has(tool.name) || this.aliases.has(tool.name)) {
      throw new AppError('TOOL_CONFLICT', `Tool is already registered: ${tool.name}`, {
        name: tool.name
      });
    }

    this.tools.set(tool.name, tool);
  }

  registerMany(tools: readonly RegisteredToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  get(name: string): RegisteredToolDefinition | undefined {
    const resolvedName = this.aliases.get(name) ?? name;
    return this.tools.get(resolvedName);
  }

  values(): RegisteredToolDefinition[] {
    return Array.from(this.tools.values());
  }

  has(name: string): boolean {
    return this.get(name) !== undefined;
  }
}
