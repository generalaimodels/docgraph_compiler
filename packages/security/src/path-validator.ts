import { posix } from "node:path";

export function normalizeRepoPath(input: string): string {
  const normalized = posix.normalize(input.replaceAll("\\", "/"));
  return normalized.replace(/^\.\/+/u, "");
}

export function assertSafeRepoPath(input: string): string {
  const normalized = normalizeRepoPath(input);

  if (normalized.startsWith("../") || normalized === ".." || normalized.startsWith("/")) {
    throw new Error(`Unsafe repository path: ${input}`);
  }

  return normalized;
}

export function resolveRelativeRepoPath(basePath: string, targetPath: string): string {
  const safeBase = assertSafeRepoPath(basePath);
  const safeTarget = targetPath.replaceAll("\\", "/");
  const directory = posix.dirname(safeBase);
  return assertSafeRepoPath(posix.join(directory, safeTarget));
}
