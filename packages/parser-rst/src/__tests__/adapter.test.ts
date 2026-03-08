import { describe, expect, it } from "vitest";
import type { ParseContext } from "@docgraph/core-ir";
import { RstAdapter } from "../adapter.js";

function createContext(content: string): ParseContext {
  return {
    source: {
      path: "index.rst",
      extension: ".rst",
      bytes: new TextEncoder().encode(content)
    },
    resolveRelativePath: async () => null,
    emitDiagnostic: () => undefined,
    registerAsset: (asset) => ({
      ...asset,
      assetId: "asset-1" as never
    }),
    signal: new AbortController().signal
  };
}

describe("RstAdapter", () => {
  it("parses headings, code blocks, admonitions, and local links", async () => {
    const adapter = new RstAdapter();
    const result = await adapter.parse(
      createContext(
        [
          "Quickstart",
          "==========",
          "",
          ".. note::",
          "   Read the `guide <guide.rst>`_.",
          "",
          ".. code-block:: bash",
          "",
          "   torchrun --standalone train.py"
        ].join("\n")
      )
    );

    expect(result.ir.title).toBe("Quickstart");
    expect(result.ir.blocks.some((block) => block.kind === "callout")).toBe(true);
    expect(result.ir.blocks.some((block) => block.kind === "code-block")).toBe(true);
    expect(result.ir.linkGraph[0]?.hrefRaw).toBe("guide.rst");
  });

  it("parses inline math, math directives, and raw latex directives into math nodes", async () => {
    const adapter = new RstAdapter();
    const result = await adapter.parse(
      createContext(
        [
          "Math",
          "====",
          "",
          "Inline :math:`\\theta^2 + \\lambda` and \\(a + b\\).",
          "",
          ".. math::",
          "",
          "   \\theta^{*} = \\arg\\min_{\\theta} \\mathcal{L}(\\theta)",
          "",
          ".. raw:: latex",
          "",
          "   \\[",
          "   \\mathcal{D} = \\{x_1, x_2\\}",
          "   \\]"
        ].join("\n")
      )
    );

    const paragraph = result.ir.blocks.find((block) => block.kind === "paragraph");
    const mathBlocks = result.ir.blocks.filter((block) => block.kind === "math-block");

    expect(paragraph?.kind).toBe("paragraph");
    expect(paragraph?.children.some((child) => child.kind === "math-inline")).toBe(true);
    expect(mathBlocks).toHaveLength(2);
    expect(mathBlocks[0] && "value" in mathBlocks[0] ? mathBlocks[0].value : "").toContain("\\arg\\min");
    expect(mathBlocks[1] && "value" in mathBlocks[1] ? mathBlocks[1].value : "").toContain("\\mathcal{D}");
  });
});
