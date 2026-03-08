import { describe, expect, it } from "vitest";
import type { DocumentIR } from "@docgraph/core-types";
import { makeDocId } from "@docgraph/core-types";
import { renderHtml } from "../ir-to-html.js";

function createDocument(blocks: DocumentIR["blocks"]): DocumentIR {
  return {
    id: makeDocId("doc-1"),
    title: "Math",
    metadata: {},
    blocks,
    linkGraph: [],
    assets: [],
    diagnostics: [],
    provenance: {
      sourceFormat: "md",
      parser: {
        name: "test",
        version: "0.0.0"
      },
      parsedAt: "2026-03-08T00:00:00.000Z"
    },
    canonicalHash: "hash",
    fidelity: {
      tier: "A",
      rawEmbedCount: 0,
      unresolvedLinkCount: 0,
      errorCount: 0,
      warningCount: 0
    }
  };
}

describe("renderHtml", () => {
  it("renders inline and block math through katex output", () => {
    const html = renderHtml(
      createDocument([
        {
          kind: "paragraph",
          nodeId: "node-1" as never,
          children: [
            { kind: "text", value: "Inline " },
            {
              kind: "math-inline",
              value: "\\theta^2 + \\lambda",
              dialect: "latex",
              delimiter: "$"
            }
          ]
        },
        {
          kind: "math-block",
          nodeId: "node-2" as never,
          value: "\\theta^{*} = \\arg\\min_{\\theta} \\mathcal{L}(\\theta)",
          dialect: "latex",
          delimiter: "$$"
        }
      ])
    );

    expect(html).toContain('class="dg-math-inline"');
    expect(html).toContain('class="dg-math-block"');
    expect(html).toContain('class="katex"');
    expect(html).toContain("katex-display");
    expect(html).toContain("mathml");
  });
});
