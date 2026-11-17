const STORAGE_KEY = 'plateia.session';
let memorySession: string | undefined;

/**
 * Anonymous visitor id sent with booking requests. It is not authentication:
 * it only lets the API tell "my hold" from "someone else's" without a login.
 * Falls back to memory when storage is blocked (private mode, strict settings).
 */
export function getSessionId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
    const created = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    memorySession ??= crypto.randomUUID();
    return memorySession;
  }
}
