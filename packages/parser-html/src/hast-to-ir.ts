import { parseFragment } from "parse5";
import type { IRBuilder } from "@docgraph/core-ir";
import { makeNodeIdAuto } from "@docgraph/core-ir";
import type { BlockNode, InlineNode, LinkType } from "@docgraph/core-types";

type HtmlNode = {
  nodeName?: string;
  tagName?: string;
  value?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: HtmlNode[];
};

function getAttribute(node: HtmlNode, name: string): string | undefined {
  return node.attrs?.find((attribute) => attribute.name === name)?.value;
}

function classifyLink(href: string): { linkType: LinkType; resolved: boolean; anchor?: string } {
  if (/^(?:https?:)?\/\//u.test(href) || href.startsWith("mailto:")) {
    return { linkType: "doc-to-external", resolved: true };
  }

  if (href.startsWith("#")) {
    return { linkType: "doc-to-anchor", resolved: true, anchor: href.slice(1) };
  }

  const hashIndex = href.indexOf("#");
  if (hashIndex >= 0) {
    return {
      linkType: "doc-to-doc",
      resolved: false,
      anchor: href.slice(hashIndex + 1)
    };
  }

  return { linkType: "doc-to-doc", resolved: false };
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9\s-]/gu, "").replace(/\s+/gu, "-");
}

function inlineText(nodes: readonly InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case "text":
          return node.value;
        case "inline-code":
          return node.value;
        case "break":
          return " ";
        case "image":
          return node.alt ?? "";
        case "emphasis":
        case "highlight":
        case "link":
        case "strong":
        case "strikethrough":
        case "subscript":
        case "superscript":
          return inlineText(node.children);
        case "math-inline":
          return node.value;
        case "footnote-ref":
          return node.label ?? node.identifier;
        case "html-span":
          return node.value;
      }
    })
    .join("");
}

function mapInlineNode(node: HtmlNode, builder: IRBuilder): InlineNode[] {
  const tag = node.tagName ?? node.nodeName;

  if (tag === "#text") {
    return node.value && node.value.trim().length > 0 ? [{ kind: "text", value: node.value }] : [];
  }

  switch (tag) {
    case "strong":
    case "b":
      return [{ kind: "strong", children: mapInlineNodes(node.childNodes, builder) }];
    case "em":
    case "i":
      return [{ kind: "emphasis", children: mapInlineNodes(node.childNodes, builder) }];
    case "code":
      return [{ kind: "inline-code", value: inlineText(mapInlineNodes(node.childNodes, builder)) }];
    case "a": {
      const href = getAttribute(node, "href") ?? "";
      const classification = classifyLink(href);
      builder.addLink({
        hrefRaw: href,
        linkType: classification.linkType,
        resolved: classification.resolved,
        ...(classification.anchor ? { anchor: classification.anchor } : {})
      });
      return [
        {
          kind: "link",
          href,
          children: mapInlineNodes(node.childNodes, builder),
          external: classification.linkType === "doc-to-external"
        }
      ];
    }
    case "img": {
      const src = getAttribute(node, "src") ?? "";
      const alt = getAttribute(node, "alt");
      const title = getAttribute(node, "title");
      builder.addLink({
        hrefRaw: src,
        linkType: /^(?:https?:)?\/\//u.test(src) ? "doc-to-external" : "doc-to-asset",
        resolved: /^(?:https?:)?\/\//u.test(src)
      });
      return [
        {
          kind: "image",
          src,
          ...(alt !== undefined ? { alt } : {}),
          ...(title !== undefined ? { title } : {})
        }
      ];
    }
    case "br":
      return [{ kind: "break" }];
    case "mark":
      return [{ kind: "highlight", children: mapInlineNodes(node.childNodes, builder) }];
    case "sup":
      return [{ kind: "superscript", children: mapInlineNodes(node.childNodes, builder) }];
    case "sub":
      return [{ kind: "subscript", children: mapInlineNodes(node.childNodes, builder) }];
    default:
      return mapInlineNodes(node.childNodes, builder);
  }
}

function mapInlineNodes(nodes: readonly HtmlNode[] | undefined, builder: IRBuilder): InlineNode[] {
  return (nodes ?? []).flatMap((node) => mapInlineNode(node, builder));
}

function mapTableRows(nodes: readonly HtmlNode[] | undefined, builder: IRBuilder) {
  return (nodes ?? [])
    .filter((node) => (node.tagName ?? node.nodeName) === "tr")
    .map((row) => ({
      kind: "table-row" as const,
      nodeId: makeNodeIdAuto(),
      cells: (row.childNodes ?? [])
        .filter((cell) => ["td", "th"].includes(cell.tagName ?? cell.nodeName ?? ""))
        .map((cell) => ({
          kind: "table-cell" as const,
          nodeId: makeNodeIdAuto(),
          children: mapInlineNodes(cell.childNodes, builder)
        }))
    }));
}

function mapBlockNode(node: HtmlNode, builder: IRBuilder): BlockNode[] {
  const tag = node.tagName ?? node.nodeName;

  if (tag === "#text") {
    return node.value && node.value.trim().length > 0
      ? [
          {
            kind: "paragraph",
            nodeId: makeNodeIdAuto(),
            children: [{ kind: "text", value: node.value.trim() }]
          }
        ]
      : [];
  }

  switch (tag) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const children = mapInlineNodes(node.childNodes, builder);
      const title = inlineText(children);
      return [
        {
          kind: "heading",
          nodeId: makeNodeIdAuto(),
          level: Number(tag.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6,
          slug: slugify(title),
          children
        }
      ];
    }
    case "p":
      return [
        {
          kind: "paragraph",
          nodeId: makeNodeIdAuto(),
          children: mapInlineNodes(node.childNodes, builder)
        }
      ];
    case "ul":
    case "ol":
      return [
        {
          kind: "list",
          nodeId: makeNodeIdAuto(),
          ordered: tag === "ol",
          items: (node.childNodes ?? [])
            .filter((child) => (child.tagName ?? child.nodeName) === "li")
            .map((item) => ({
              kind: "list-item" as const,
              nodeId: makeNodeIdAuto(),
              children: mapBlockNodes(item.childNodes, builder)
            }))
        }
      ];
    case "blockquote":
      return [
        {
          kind: "quote",
          nodeId: makeNodeIdAuto(),
          children: mapBlockNodes(node.childNodes, builder)
        }
      ];
    case "pre": {
      const codeNode = (node.childNodes ?? []).find((child) => (child.tagName ?? child.nodeName) === "code");
      const className = getAttribute(codeNode ?? {}, "class") ?? "";
      const language = className.startsWith("language-") ? className.slice("language-".length) : undefined;
      return [
        {
          kind: "code-block",
          nodeId: makeNodeIdAuto(),
          value: codeNode ? inlineText(mapInlineNodes(codeNode.childNodes, builder)) : inlineText(mapInlineNodes(node.childNodes, builder)),
          ...(language ? { language } : {})
        }
      ];
    }
    case "hr":
      return [{ kind: "thematic-break", nodeId: makeNodeIdAuto() }];
    case "img": {
      const mediaAlt = getAttribute(node, "alt");
      const mediaTitle = getAttribute(node, "title");
      return [
        {
          kind: "media-block",
          nodeId: makeNodeIdAuto(),
          mediaType: "image",
          src: getAttribute(node, "src") ?? "",
          ...(mediaAlt !== undefined ? { alt: mediaAlt } : {}),
          ...(mediaTitle !== undefined ? { title: mediaTitle } : {})
        }
      ];
    }
    case "table": {
      const head = (node.childNodes ?? []).find((child) => (child.tagName ?? child.nodeName) === "thead");
      const body = (node.childNodes ?? []).find((child) => (child.tagName ?? child.nodeName) === "tbody");
      const directRows = (node.childNodes ?? []).filter((child) => (child.tagName ?? child.nodeName) === "tr");
      const firstDirectRow = directRows[0];
      const headerRows = head ? mapTableRows(head.childNodes, builder) : firstDirectRow ? mapTableRows([firstDirectRow], builder) : [];
      const bodyRows = body
        ? mapTableRows(body.childNodes, builder)
        : directRows.length > 1
          ? mapTableRows(directRows.slice(1), builder)
          : [];
      const width = headerRows[0]?.cells.length ?? bodyRows[0]?.cells.length ?? 0;
      return [
        {
          kind: "table",
          nodeId: makeNodeIdAuto(),
          columns: Array.from({ length: width }, () => ({})),
          header: headerRows.filter(Boolean),
          body: bodyRows
        }
      ];
    }
    default:
      return mapBlockNodes(node.childNodes, builder);
  }
}

export function mapBlockNodes(nodes: readonly HtmlNode[] | undefined, builder: IRBuilder): BlockNode[] {
  return (nodes ?? []).flatMap((node) => mapBlockNode(node, builder));
}

export function populateBuilderFromHtmlFragment(html: string, builder: IRBuilder): BlockNode[] {
  const fragment = parseFragment(html) as HtmlNode;
  const blocks = mapBlockNodes(fragment.childNodes, builder);
  const firstHeading = blocks.find((block): block is Extract<BlockNode, { kind: "heading" }> => block.kind === "heading" && block.level === 1);
  if (firstHeading) {
    builder.setTitle(inlineText(firstHeading.children));
  }
  return blocks;
}
