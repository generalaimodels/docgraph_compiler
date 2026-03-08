import type { AssetId, DocId, EdgeId } from "./identifiers.js";

export type LinkType =
  | "doc-to-doc"
  | "doc-to-anchor"
  | "doc-to-asset"
  | "doc-to-external"
  | "doc-to-unknown";

export interface LinkRef {
  edgeId: EdgeId;
  srcDocId: DocId;
  dstDocId?: DocId;
  dstAssetId?: AssetId;
  linkType: LinkType;
  hrefRaw: string;
  anchor?: string;
  resolved: boolean;
  sourceLine?: number;
}
