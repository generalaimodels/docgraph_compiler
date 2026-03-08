import type { IRBuilder } from "@docgraph/core-ir";
import type { InlineNode, LinkType } from "@docgraph/core-types";

const INLINE_PATTERN =
  /(`([^`]+?)\s*<([^>]+)>`_|:([a-zA-Z0-9_.:-]+):`([^`]+)`|``([^`]+)``|\*\*([^*]+)\*\*|\*([^*]+)\*)/gu;

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

export function inlineText(nodes: readonly InlineNode[]): string {
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
          return inlineText(node.children);
      }
    })
    .join("")
    .trim();
}

export function parseInlineRst(text: string, builder: IRBuilder, sourceLine?: number): InlineNode[] {
  const nodes: InlineNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      nodes.push({ kind: "text", value: text.slice(cursor, index) });
    }

    if (match[2] && match[3]) {
      const href = match[3];
      const classification = classifyLink(href);
      builder.addLink({
        hrefRaw: href,
        linkType: classification.linkType,
        resolved: classification.resolved,
        ...(classification.anchor ? { anchor: classification.anchor } : {}),
        ...(sourceLine !== undefined ? { sourceLine } : {})
      });
      nodes.push({
        kind: "link",
        href,
        children: [{ kind: "text", value: match[2] }],
        ...(classification.linkType === "doc-to-external" ? { external: true } : {}),
        ...(classification.anchor ? { resolvedAnchor: classification.anchor } : {})
      });
    } else if (match[4] && match[5]) {
      const role = match[4];
      const target = match[5];
      if (role === "doc" || role === "ref") {
        const href = target.endsWith(".html") ? target : `${target}.html`;
        const classification = classifyLink(href);
        builder.addLink({
          hrefRaw: href,
          linkType: classification.linkType,
          resolved: classification.resolved,
          ...(classification.anchor ? { anchor: classification.anchor } : {}),
          ...(sourceLine !== undefined ? { sourceLine } : {})
        });
        nodes.push({
          kind: "link",
          href,
          children: [{ kind: "text", value: target }],
          ...(classification.anchor ? { resolvedAnchor: classification.anchor } : {})
        });
      } else {
        nodes.push({ kind: "inline-code", value: target });
      }
    } else if (match[6]) {
      nodes.push({ kind: "inline-code", value: match[6] });
    } else if (match[7]) {
      nodes.push({ kind: "strong", children: [{ kind: "text", value: match[7] }] });
    } else if (match[8]) {
      nodes.push({ kind: "emphasis", children: [{ kind: "text", value: match[8] }] });
    }

    cursor = index + match[0].length;
  }

  if (cursor < text.length) {
    nodes.push({ kind: "text", value: text.slice(cursor) });
  }

  return nodes.length > 0 ? nodes : [{ kind: "text", value: text }];
}
