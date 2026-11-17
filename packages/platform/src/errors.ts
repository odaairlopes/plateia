/**
 * An expected business failure. The HTTP layer turns it into a response with
 * `status` and a stable machine-readable `code`; anything else is a 500.
 */
export class DomainError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const notFound = (code: string, message: string): DomainError =>
  new DomainError(code, message, 404);

export const conflict = (code: string, message: string, details?: unknown): DomainError =>
  new DomainError(code, message, 409, details);

export const gone = (code: string, message: string): DomainError =>
  new DomainError(code, message, 410);

export const unprocessable = (code: string, message: string, details?: unknown): DomainError =>
  new DomainError(code, message, 422, details);
