import { z } from 'zod';

export const reverseStageSchema = z.enum(['observe', 'capture', 'rebuild', 'patch', 'pure', 'port', 'delivery']);
export const sdkTargetSchema = z.enum(['node', 'python', 'dual']);
