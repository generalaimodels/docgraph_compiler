import type { AssetRef, Diagnostic, DocumentIR, LinkRef, SourceFormat } from "@docgraph/core-types";

export interface SourceDescriptor {
  path: string;
  extension: string;
  mimeType?: string;
  bytes: Uint8Array;
  encoding?: string;
  repoContext?: {
    owner: string;
    repo: string;
    ref: string;
    commitSha: string;
    basePath: string;
  };
}

export interface SniffResult {
  accepted: boolean;
  confidence: number;
  profile?: string;
  encoding?: string;
  containerType?: "zip" | "gzip" | "json" | "xml" | "plain" | "binary";
}

export interface ParseContext {
  source: SourceDescriptor;
  resolveRelativePath: (relPath: string) => Promise<SourceDescriptor | null>;
  emitDiagnostic: (diagnostic: Omit<Diagnostic, "id">) => void;
  registerAsset: (asset: Omit<AssetRef, "assetId">) => AssetRef;
  signal: AbortSignal;
}

export interface ParseResult {
  ir: DocumentIR;
  rawAst?: unknown;
}

export interface SourceAdapter {
  readonly name: string;
  readonly version: string;
  readonly format: SourceFormat;
  sniff(input: SourceDescriptor): Promise<SniffResult>;
  parse(ctx: ParseContext): Promise<ParseResult>;
  extractLinks?(ctx: ParseContext): Promise<LinkRef[]>;
  extractAssets?(ctx: ParseContext): Promise<AssetRef[]>;
}
