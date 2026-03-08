import type { AssetId, FileId } from "./identifiers.js";

export interface AssetRef {
  assetId: AssetId;
  fileId?: FileId;
  checksum: string;
  mediaType: string;
  width?: number;
  height?: number;
  sizeBytes: number;
  objectKey: string;
  sourcePath: string;
  usageCount: number;
}
