import type { DocumentIR } from "@docgraph/core-types";

export function renderJson(ir: DocumentIR): string {
  return JSON.stringify(ir, null, 2);
}
