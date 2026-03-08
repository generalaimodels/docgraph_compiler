import type { DocumentIR } from "@docgraph/core-types";
import { computeFidelityReport } from "./ir-builder.js";

export function attachDiagnostics(
  ir: DocumentIR,
  diagnostics: DocumentIR["diagnostics"]
): DocumentIR {
  if (diagnostics.length === 0) {
    return ir;
  }

  return {
    ...ir,
    diagnostics: [...ir.diagnostics, ...diagnostics],
    fidelity: computeFidelityReport(ir.blocks, ir.linkGraph, [...ir.diagnostics, ...diagnostics])
  };
}

export function replaceLinkGraph(ir: DocumentIR, linkGraph: DocumentIR["linkGraph"]): DocumentIR {
  return {
    ...ir,
    linkGraph,
    fidelity: computeFidelityReport(ir.blocks, linkGraph, ir.diagnostics)
  };
}

export function stableSerializeIr(ir: DocumentIR): string {
  return JSON.stringify(
    ir,
    (key, value) => {
      if (key === "nodeId" || key === "id" || key === "edgeId" || key === "assetId") {
        return undefined;
      }

      return value;
    },
    2
  );
}
