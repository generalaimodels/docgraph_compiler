export const SUPPORTED_EXTENSIONS = [
  ".rdx",
  ".mdx",
  ".md",
  ".rst",
  ".docx",
  ".ipynb"
] as const;

export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_MEDIA_SIZE_BYTES = 100 * 1024 * 1024;
export const MAX_ARCHIVE_EXPANSION_RATIO = 100;
export const MAX_REPO_FILES = 100_000;
export const MAX_CONCURRENT_FETCHES_PER_REPO = 8;
export const MAX_LINK_DEPTH = 50;
export const IDEMPOTENCY_KEY_TTL_SECONDS = 86400 * 7;
