import { randomUUID } from "node:crypto";
import type { AssetRef, BlockNode, Diagnostic, DocumentIR, FidelityReport, LinkRef, Provenance } from "@docgraph/core-types";
import {
  makeAssetId,
  makeDiagnosticId,
  makeDocId,
  makeEdgeId,
  makeNodeId,
  type NodeId
} from "@docgraph/core-types";
import { computeCanonicalHash } from "./ir-hash.js";

export function makeNodeIdAuto(): NodeId {
  return makeNodeId(randomUUID());
}

export function computeFidelityReport(
  blocks: readonly BlockNode[],
  links: readonly LinkRef[],
  diagnostics: readonly Diagnostic[]
): FidelityReport {
  let rawEmbedCount = 0;

  const walkBlocks = (nodes: readonly BlockNode[]): void => {
    for (const node of nodes) {
      if (node.kind === "raw-embed") {
        rawEmbedCount += 1;
      }

      if ("children" in node && Array.isArray(node.children)) {
        const firstChild = node.children[0];
        if (typeof firstChild === "object" && firstChild !== null && "kind" in firstChild) {
          walkBlocks(node.children as readonly BlockNode[]);
        }
      }

      if (node.kind === "list") {
        for (const item of node.items) {
          walkBlocks(item.children);
        }
      }

      if (node.kind === "definition-list") {
        for (const item of node.items) {
          for (const definition of item.definitions) {
            walkBlocks(definition);
          }
        }
      }

      if (node.kind === "notebook-cell" && node.children) {
        walkBlocks(node.children);
      }
    }
  };

  walkBlocks(blocks);

  const unresolvedLinkCount = links.filter((link) => !link.resolved).length;
  const errorCount = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warningCount = diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;

  let tier: FidelityReport["tier"] = "A";
  if (rawEmbedCount > 0 || errorCount > 0) {
    tier = "B";
  }

  if (blocks.length > 0 && rawEmbedCount / blocks.length > 0.3) {
    tier = "C";
  }

  return {
    tier,
    rawEmbedCount,
    unresolvedLinkCount,
    errorCount,
    warningCount
  };
}

export class IRBuilder {
  private readonly documentId = makeDocId(randomUUID());
  private readonly blocks: BlockNode[] = [];
  private readonly links: LinkRef[] = [];
  private readonly assets: AssetRef[] = [];
  private readonly diagnostics: Diagnostic[] = [];
  private metadata: Record<string, unknown> = {};
  private title?: string;
  private provenance?: Provenance;

  getDocumentId() {
    return this.documentId;
  }

  setTitle(title: string): this {
    if (title.trim().length > 0) {
      this.title = title.trim();
    }

    return this;
  }

  setMetadata(metadata: Record<string, unknown>): this {
    this.metadata = metadata;
    return this;
  }

  mergeMetadata(metadata: Record<string, unknown>): this {
    this.metadata = { ...this.metadata, ...metadata };
    return this;
  }

  setProvenance(provenance: Provenance): this {
    this.provenance = provenance;
    return this;
  }

  addBlock(block: BlockNode): this {
    this.blocks.push(block);
    return this;
  }

  addBlocks(blocks: readonly BlockNode[]): this {
    this.blocks.push(...blocks);
    return this;
  }

  addLink(link: Omit<LinkRef, "edgeId" | "srcDocId">): LinkRef {
    const normalized: LinkRef = {
      ...link,
      edgeId: makeEdgeId(randomUUID()),
      srcDocId: this.documentId
    };
    this.links.push(normalized);
    return normalized;
  }

  addAsset(asset: Omit<AssetRef, "assetId">): AssetRef {
    const normalized: AssetRef = {
      ...asset,
      assetId: makeAssetId(randomUUID())
    };
    this.assets.push(normalized);
    return normalized;
  }

  addDiagnostic(diagnostic: Omit<Diagnostic, "id">): Diagnostic {
    const normalized: Diagnostic = {
      ...diagnostic,
      id: makeDiagnosticId(randomUUID())
    };
    this.diagnostics.push(normalized);
    return normalized;
  }

  build(): DocumentIR {
    if (!this.provenance) {
      throw new Error("Provenance is required for DocumentIR construction.");
    }

    return {
      id: this.documentId,
      metadata: this.metadata,
      blocks: this.blocks,
      linkGraph: this.links,
      assets: this.assets,
      diagnostics: this.diagnostics,
      provenance: this.provenance,
      canonicalHash: computeCanonicalHash(this.blocks),
      fidelity: computeFidelityReport(this.blocks, this.links, this.diagnostics),
      ...(this.title ? { title: this.title } : {})
    };
  }
}
