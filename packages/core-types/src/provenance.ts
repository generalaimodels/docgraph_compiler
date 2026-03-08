import type { FileId, RepoId, RevisionId } from "./identifiers.js";

export type SourceFormat =
  | "md"
  | "mdx"
  | "rst"
  | "ipynb"
  | "docx"
  | "html"
  | "rdx-custom";

export interface Provenance {
  sourceFormat: SourceFormat;
  repo?: {
    owner: string;
    repo: string;
    ref: string;
    path: string;
    commitSha: string;
  };
  fileId?: FileId;
  repoId?: RepoId;
  revisionId?: RevisionId;
  byteRange?: [start: number, end: number];
  lineRange?: [start: number, end: number];
  parser: {
    name: string;
    version: string;
    profile?: string;
  };
  parsedAt: string;
}
