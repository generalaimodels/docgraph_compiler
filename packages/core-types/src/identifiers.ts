export type Brand<TValue, TBrand extends string> = TValue & {
  readonly __brand: TBrand;
};

export type DocId = Brand<string, "DocId">;
export type FileId = Brand<string, "FileId">;
export type RepoId = Brand<string, "RepoId">;
export type RevisionId = Brand<string, "RevisionId">;
export type AssetId = Brand<string, "AssetId">;
export type JobId = Brand<string, "JobId">;
export type EdgeId = Brand<string, "EdgeId">;
export type NodeId = Brand<string, "NodeId">;
export type DiagnosticId = Brand<string, "DiagnosticId">;

export function makeDocId(raw: string): DocId {
  return raw as DocId;
}

export function makeFileId(raw: string): FileId {
  return raw as FileId;
}

export function makeRepoId(raw: string): RepoId {
  return raw as RepoId;
}

export function makeRevisionId(raw: string): RevisionId {
  return raw as RevisionId;
}

export function makeAssetId(raw: string): AssetId {
  return raw as AssetId;
}

export function makeJobId(raw: string): JobId {
  return raw as JobId;
}

export function makeEdgeId(raw: string): EdgeId {
  return raw as EdgeId;
}

export function makeNodeId(raw: string): NodeId {
  return raw as NodeId;
}

export function makeDiagnosticId(raw: string): DiagnosticId {
  return raw as DiagnosticId;
}
