import { AppError } from '../core/errors.js';
import type { WatchExpressionRecord } from './types.js';

export class WatchExpressionRegistry {
  private counter = 0;
  private readonly items = new Map<string, WatchExpressionRecord>();

  add(expression: string): WatchExpressionRecord {
    const normalizedExpression = expression.trim();
    if (!normalizedExpression) {
      throw new AppError('WATCH_EXPRESSION_REQUIRED', 'add_watch_expression requires a non-empty expression.');
    }

    const item: WatchExpressionRecord = {
      createdAt: new Date().toISOString(),
      enabled: true,
      expression: normalizedExpression,
      watchId: `watch-${++this.counter}`
    };
    this.items.set(item.watchId, item);
    return { ...item };
  }

  list(): WatchExpressionRecord[] {
    return Array.from(this.items.values())
      .map((item) => ({ ...item }))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  remove(watchId: string): boolean {
    return this.items.delete(watchId);
  }

  clear(): void {
    this.items.clear();
  }
}
