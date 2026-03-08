import { extname } from "node:path";
import type { SourceDescriptor } from "@docgraph/core-ir";

const MIME_BY_EXTENSION: Record<string, string> = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".ipynb": "application/x-ipynb+json",
  ".md": "text/markdown",
  ".mdx": "text/mdx",
  ".rdx": "application/octet-stream"
};

function detectEncoding(bytes: Uint8Array): string | undefined {
  for (let index = 0; index < Math.min(bytes.length, 512); index += 1) {
    if (bytes[index] === 0) {
      return undefined;
    }
  }

  return "utf-8";
}

export function createSourceDescriptor(
  path: string,
  bytes: Uint8Array,
  repoContext?: SourceDescriptor["repoContext"]
): SourceDescriptor {
  const extension = extname(path).toLowerCase();
  const encoding = detectEncoding(bytes);
  const mimeType = MIME_BY_EXTENSION[extension];

  return {
    path,
    extension,
    bytes,
    ...(repoContext ? { repoContext } : {}),
    ...(encoding ? { encoding } : {}),
    ...(mimeType ? { mimeType } : {})
  };
}
