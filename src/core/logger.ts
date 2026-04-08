type LogLevel = 'info' | 'warn' | 'error';

function write(level: LogLevel, message: string, details?: unknown): void {
  const suffix = details === undefined ? '' : ` ${formatDetails(details)}`;
  process.stderr.write(`[${level}] ${message}${suffix}\n`);
}

function formatDetails(details: unknown): string {
  if (details instanceof Error) {
    return details.stack ?? details.message;
  }

  if (typeof details === 'string') {
    return details;
  }

  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

export const logger = {
  info(message: string, details?: unknown): void {
    write('info', message, details);
  },
  warn(message: string, details?: unknown): void {
    write('warn', message, details);
  },
  error(message: string, details?: unknown): void {
    write('error', message, details);
  }
};
