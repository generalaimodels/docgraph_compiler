import type { LinkRef } from "@docgraph/core-types";

export interface BacklinkSource {
  docId: string;
  links: LinkRef[];
}

export function buildBacklinkIndex(documents: readonly BacklinkSource[]): Map<string, LinkRef[]> {
  const backlinks = new Map<string, LinkRef[]>();

  for (const document of documents) {
    for (const link of document.links) {
      if (!link.dstDocId) {
        continue;
      }

      const current = backlinks.get(link.dstDocId) ?? [];
      current.push(link);
      backlinks.set(link.dstDocId, current);
    }
  }

  return backlinks;
}
