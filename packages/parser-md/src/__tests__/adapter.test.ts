import { describe, expect, it } from "vitest";
import type { ParseContext } from "@docgraph/core-ir";
import { MarkdownAdapter } from "../adapter.js";

function createContext(markdown: string): ParseContext {
  return {
    source: {
      path: "guide.md",
      extension: ".md",
      bytes: new TextEncoder().encode(markdown)
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

describe("MarkdownAdapter", () => {
  it("maps headings, paragraphs, and links into canonical IR", async () => {
    const adapter = new MarkdownAdapter();
    const result = await adapter.parse(
      createContext("# Heading\n\nParagraph with a [link](./api.md).\n")
    );

    expect(result.ir.title).toBe("Heading");
    expect(result.ir.blocks[0]?.kind).toBe("heading");
    expect(result.ir.linkGraph).toHaveLength(1);
    expect(result.ir.linkGraph[0]?.hrefRaw).toBe("./api.md");
  });

  it("normalizes inline and block latex delimiters into math nodes", async () => {
    const adapter = new MarkdownAdapter();
    const result = await adapter.parse(
      createContext("# Math\n\nInline \\(a + b\\) and $c + d$.\n\n\\[\n\\theta^{*} = \\arg\\min_{\\theta} \\mathcal{L}(\\theta)\n\\]\n")
    );

    const paragraph = result.ir.blocks.find((block) => block.kind === "paragraph");
    const mathBlock = result.ir.blocks.find((block) => block.kind === "math-block");

    expect(paragraph?.kind).toBe("paragraph");
    expect(paragraph?.children.some((child) => child.kind === "math-inline")).toBe(true);
    expect(mathBlock?.kind).toBe("math-block");
    expect(mathBlock && "value" in mathBlock ? mathBlock.value : "").toContain("\\arg\\min");
  });
});
