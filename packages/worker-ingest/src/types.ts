import type { JobSummary, SearchProjection, TocEntry } from "@docgraph/api-contracts";
import type { Diagnostic, DocumentIR, LinkRef, SourceFormat } from "@docgraph/core-types";

export interface CompiledDocumentRecord {
  docId: string;
  path: string;
  title?: string;
  format: SourceFormat;
  canonicalHash: string;
  diagnostics: Diagnostic[];
  ir: DocumentIR;
  htmlPreview: string;
  markdownPreview: string;
  jsonPreview: string;
  toc: TocEntry[];
  links: LinkRef[];
  backlinks: LinkRef[];
  searchProjection: SearchProjection;
  createdAt: string;
  updatedAt: string;
  repoKey?: string;
}

export interface CompilerJobRecord extends JobSummary {
  source: {
    kind: "file" | "github";
    label: string;
  };
  idempotencyKey?: string;
}

export interface RepositoryFileDescriptor {
  path: string;
  sha: string;
  sizeBytes: number;
}

export interface GitHubRepositoryListing {
  commitSha: string;
  files: RepositoryFileDescriptor[];
}
