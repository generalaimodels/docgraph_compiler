export const ERROR_CODES = {
  DOCUMENT_NOT_FOUND: "DOCUMENT_NOT_FOUND",
  INVALID_REQUEST: "INVALID_REQUEST",
  JOB_NOT_FOUND: "JOB_NOT_FOUND",
  REPO_IMPORT_FAILED: "REPO_IMPORT_FAILED",
  UNSUPPORTED_SOURCE: "UNSUPPORTED_SOURCE"
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ApiError {
  code: ErrorCode | string;
  message: string;
  details?: Record<string, unknown>;
}
