export type NormalizedError = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export class AppError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof AppError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details })
      }
    };
  }

  if (error instanceof Error) {
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message
      }
    };
  }

  return {
    ok: false,
    error: {
      code: 'UNKNOWN_ERROR',
      message: 'Unknown error',
      details: error
    }
  };
}
