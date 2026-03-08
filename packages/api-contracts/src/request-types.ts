import type { SupportedExtension } from "@docgraph/core-types";

export interface ImportRepoRequest {
  source: {
    provider: "github";
    owner: string;
    repo: string;
    ref?: string;
    path?: string;
  };
  options?: {
    recursive?: boolean;
    includeExtensions?: SupportedExtension[];
    followLocalLinks?: boolean;
  };
}

export interface ImportLocalRepoRequest {
  source: {
    rootPath: string;
    path?: string;
  };
  options?: {
    recursive?: boolean;
    includeExtensions?: SupportedExtension[];
    followLocalLinks?: boolean;
  };
}

export interface ImportFileRequest {
  path: string;
  contentBase64: string;
}

export interface RenderRequest {
  docId: string;
  format: "html" | "md" | "json";
}
