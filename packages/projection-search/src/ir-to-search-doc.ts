import type { SearchProjection } from "@docgraph/api-contracts";
import type { BlockNode, DocumentIR, InlineNode } from "@docgraph/core-types";

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
    .join("");
}

function blockText(block: BlockNode): string {
  switch (block.kind) {
    case "heading":
    case "paragraph":
      return text(block.children);
    case "list":
      return block.items.map((item) => item.children.map(blockText).join(" ")).join(" ");
    case "code-block":
    case "math-block":
      return block.value;
    case "quote":
      return block.children.map(blockText).join(" ");
    case "callout":
      return block.children.map(blockText).join(" ");
    case "media-block":
      return block.alt ?? block.title ?? "";
    case "notebook-cell":
      return [block.source, ...(block.children?.map(blockText) ?? [])].join(" ");
    case "raw-embed":
      return block.raw;
    case "component-embed":
      return `${block.componentName} ${JSON.stringify(block.props)}`;
    case "definition-list":
      return block.items
        .map((item) => `${text(item.term)} ${item.definitions.map((definition) => definition.map(blockText).join(" ")).join(" ")}`)
        .join(" ");
    case "footnote-def":
      return block.children.map(blockText).join(" ");
    case "table":
      return [
        ...block.header.flatMap((row) => row.cells.map((cell) => text(cell.children))),
        ...block.body.flatMap((row) => row.cells.map((cell) => text(cell.children)))
      ].join(" ");
    case "thematic-break":
    case "form":
    case "list-item":
      return "";
  }
}

export function buildSearchDocument(ir: DocumentIR): SearchProjection {
  const headings = ir.blocks
    .filter((block) => block.kind === "heading")
    .map((block) => text(block.children));
  const body = ir.blocks.map(blockText).join(" ").replace(/\s+/gu, " ").trim();

  return { headings, body };
}
