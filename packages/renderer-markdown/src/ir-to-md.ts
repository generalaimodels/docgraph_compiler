import type { BlockNode, DocumentIR, InlineNode } from "@docgraph/core-types";

function renderInline(nodes: readonly InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case "text":
          return node.value;
        case "emphasis":
          return `*${renderInline(node.children)}*`;
        case "strong":
          return `**${renderInline(node.children)}**`;
        case "strikethrough":
          return `~~${renderInline(node.children)}~~`;
        case "inline-code":
          return `\`${node.value}\``;
        case "link":
          return `[${renderInline(node.children)}](${node.href})`;
        case "image":
          return `![${node.alt ?? ""}](${node.src})`;
        case "math-inline":
          return `$${node.value}$`;
        case "footnote-ref":
          return `[^${node.identifier}]`;
        case "break":
          return "  \n";
        case "html-span":
          return node.value;
        case "superscript":
        case "subscript":
        case "highlight":
          return renderInline(node.children);
      }
    })
    .join("");
}

function renderBlock(block: BlockNode): string {
  switch (block.kind) {
    case "heading":
      return `${"#".repeat(block.level)} ${renderInline(block.children)}`;
    case "paragraph":
      return renderInline(block.children);
    case "list":
      return block.items
        .map((item, index) => {
          const prefix = block.ordered ? `${(block.start ?? 1) + index}. ` : "- ";
          return `${prefix}${item.children.map(renderBlock).join("\n")}`;
        })
        .join("\n");
    case "list-item":
      return block.children.map(renderBlock).join("\n");
    case "table": {
      const header = block.header[0];
      const headerRow = header ? `| ${header.cells.map((cell) => renderInline(cell.children)).join(" | ")} |` : "";
      const separator = header ? `| ${header.cells.map(() => "---").join(" | ")} |` : "";
      const body = block.body
        .map((row) => `| ${row.cells.map((cell) => renderInline(cell.children)).join(" | ")} |`)
        .join("\n");
      return [headerRow, separator, body].filter(Boolean).join("\n");
    }
    case "code-block":
      return `\`\`\`${block.language ?? ""}\n${block.value}\n\`\`\``;
    case "math-block":
      return `$$\n${block.value}\n$$`;
    case "quote":
      return block.children.map((child) => `> ${renderBlock(child)}`).join("\n");
    case "callout":
      return `> [!${block.calloutType.toUpperCase()}]\n${block.children.map(renderBlock).join("\n")}`;
    case "thematic-break":
      return "---";
    case "media-block":
      return `![${block.alt ?? ""}](${block.src})`;
    case "form":
      return block.fields.map((field) => `- ${field.label ?? field.name}`).join("\n");
    case "notebook-cell":
      return block.cellType === "markdown" && block.children
        ? block.children.map(renderBlock).join("\n\n")
        : `\`\`\`${block.language ?? ""}\n${block.source}\n\`\`\``;
    case "raw-embed":
      return `\`\`\`${block.originalFormat}\n${block.rawBinary ?? block.raw}\n\`\`\``;
    case "component-embed":
      return `<${block.componentName} />`;
    case "definition-list":
      return block.items.map((item) => `${renderInline(item.term)}\n: ${item.definitions.map((definition) => definition.map(renderBlock).join(" ")).join("\n")}`).join("\n");
    case "footnote-def":
      return `[^${block.identifier}]: ${block.children.map(renderBlock).join(" ")}`;
  }
}

export function renderMarkdown(ir: DocumentIR): string {
  return ir.blocks.map(renderBlock).join("\n\n");
}
