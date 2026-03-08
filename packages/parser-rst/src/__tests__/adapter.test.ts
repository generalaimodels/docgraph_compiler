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
});
