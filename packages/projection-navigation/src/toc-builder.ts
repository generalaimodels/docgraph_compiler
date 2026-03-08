import type { TocEntry } from "@docgraph/api-contracts";
import type { DocumentIR, InlineNode } from "@docgraph/core-types";

function text(nodes: readonly InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case "text":
          return node.value;
        case "inline-code":
          return node.value;
        case "image":
          return node.alt ?? "";
        case "break":
          return " ";
        case "math-inline":
          return node.value;
        case "footnote-ref":
          return node.label ?? node.identifier;
        case "html-span":
          return node.value;
        case "emphasis":
        case "highlight":
        case "link":
        case "strong":
        case "strikethrough":
        case "subscript":
        case "superscript":
          return text(node.children);
      }
    })
    .join("")
    .trim();
}

export function buildTableOfContents(ir: DocumentIR): TocEntry[] {
  return ir.blocks
    .filter((block) => block.kind === "heading")
    .map((block) => ({
      slug: block.slug,
      level: block.level,
      title: text(block.children)
    }));
}
