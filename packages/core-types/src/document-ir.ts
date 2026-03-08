import type { AssetRef } from "./asset-ref.js";
import type { BlockNode } from "./block-nodes.js";
import type { Diagnostic } from "./diagnostics.js";
import type { DocId } from "./identifiers.js";
import type { LinkRef } from "./link-graph.js";
import type { Provenance } from "./provenance.js";

export interface DocumentIR {
  id: DocId;
  title?: string;
  metadata: Record<string, unknown>;
  blocks: BlockNode[];
  linkGraph: LinkRef[];
  assets: AssetRef[];
  diagnostics: Diagnostic[];
  provenance: Provenance;
  canonicalHash: string;
  fidelity: FidelityReport;
}

export interface FidelityReport {
  tier: "A" | "B" | "C";
  rawEmbedCount: number;
  unresolvedLinkCount: number;
  errorCount: number;
  warningCount: number;
}
