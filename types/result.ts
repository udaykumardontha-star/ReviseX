/**
 * types/result.ts
 *
 * Typed Result<T, E> pattern used by ALL service methods.
 * Services NEVER throw raw errors — they return Result objects.
 *
 * Usage:
 *   function doSomething(): Result<string> {
 *     try { return ok("value"); }
 *     catch (e) { return err("Something failed", e); }
 *   }
 *
 *   const result = doSomething();
 *   if (!result.success) { console.error(result.error); return; }
 *   console.log(result.data); // string
 */

// ─── Core Result type ─────────────────────────────────────────────────────────

export type Success<T> = {
  readonly success: true;
  readonly data: T;
};

export type Failure = {
  readonly success: false;
  readonly error: string;
  readonly code?: ErrorCode;
  readonly cause?: unknown;
};

export type Result<T> = Success<T> | Failure;

// ─── Error codes (for UI to pattern-match on) ─────────────────────────────────

export type ErrorCode =
  | "NOT_FOUND"
  | "DUPLICATE"
  | "VALIDATION_ERROR"
  | "AI_RATE_LIMIT"
  | "AI_PARSE_ERROR"
  | "AI_API_ERROR"
  | "DB_ERROR"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_FORMAT"
  | "HASH_COLLISION"
  | "PERMISSION_DENIED"
  | "UNKNOWN";

// ─── Constructor helpers ──────────────────────────────────────────────────────

export function ok<T>(data: T): Success<T> {
  return { success: true, data };
}

export function err(
  error: string,
  cause?: unknown,
  code: ErrorCode = "UNKNOWN"
): Failure {
  return { success: false, error, code, cause };
}

// ─── Type guards ──────────────────────────────────────────────────────────────

export function isOk<T>(result: Result<T>): result is Success<T> {
  return result.success;
}

export function isErr<T>(result: Result<T>): result is Failure {
  return !result.success;
}

// ─── Utility: unwrap or throw ─────────────────────────────────────────────────
// Only use this in migration scripts or tests — never in service/route code.

export function unwrap<T>(result: Result<T>): T {
  if (result.success) return result.data;
  throw new Error(`[unwrap] ${result.error}`, { cause: result.cause });
}

// ─── Paginated result wrapper ─────────────────────────────────────────────────

export type PaginatedData<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export function paginate<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number
): PaginatedData<T> {
  const totalPages = Math.ceil(total / pageSize);
  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}
