import type { Diagnostic, DocumentIR, LinkRef } from "@docgraph/core-types";
import type { ApiError } from "./error-codes.js";
import type { JobState } from "./job-states.js";
import type { PaginationResponse } from "./pagination.js";

export interface JobSummary {
  jobId: string;
  state: JobState;
  createdAt: string;
  updatedAt: string;
  source?: {
    kind: "file" | "github" | "local";
    label: string;
  };
  progress: {
    totalFiles: number;
    completedFiles: number;
    failedFiles: number;
  };
  documentIds: string[];
  error?: ApiError;
}

export interface DocumentSummary {
  docId: string;
  path: string;
  title?: string;
  format: string;
  canonicalHash: string;
  diagnostics: Diagnostic[];
}

export interface TocEntry {
  slug: string;
  level: number;
  title: string;
}

export interface SearchProjection {
  headings: string[];
  body: string;
}

export interface DocumentResponse extends DocumentSummary {
  ir: DocumentIR;
  htmlPreview: string;
  markdownPreview: string;
  jsonPreview: string;
  toc: TocEntry[];
  links: LinkRef[];
  backlinks: LinkRef[];
  searchProjection: SearchProjection;
}

export interface LinkListResponse extends PaginationResponse {
  items: LinkRef[];
}
