import { SESSION_HEADER, type Problem } from '@plateia/contracts';
import { getSessionId } from './session';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, problem: Partial<Problem>) {
    super(problem.message ?? `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = problem.code ?? 'UNKNOWN';
    this.details = problem.details;
  }
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** 'include' sends cookies cross-origin: only for the cookie-session back office API. */
  credentials?: RequestCredentials;
}

/** Thin fetch wrapper: JSON in/out, the session header, and typed API errors. */
export async function apiRequest<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { [SESSION_HEADER]: getSessionId() };
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
    credentials: options.credentials,
  });

  if (response.status === 204) return undefined as T;

  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, payload ?? {});
  return payload as T;
}
