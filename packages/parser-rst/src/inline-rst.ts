import type { IRBuilder } from "@docgraph/core-ir";
import type { InlineNode, LinkType } from "@docgraph/core-types";

const INLINE_PATTERN =
  /(`(?<linkText>[^`]+?)\s*<(?<linkHref>[^>]+)>`_|:(?<roleName>[a-zA-Z0-9_.:-]+):`(?<roleValue>[^`]+)`|``(?<codeValue>[^`]+)``|\\\((?<parenMathValue>.+?)\\\)|(?<!\\)\$(?<dollarMathValue>[^$\n]+?)(?<!\\)\$|\*\*(?<strongValue>[^*]+)\*\*|\*(?<emphasisValue>[^*]+)\*)/gsu;

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
    const groups = match.groups ?? {};
    if (index > cursor) {
      nodes.push({ kind: "text", value: text.slice(cursor, index) });
    }

    if (groups.linkText && groups.linkHref) {
      const href = groups.linkHref;
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
        children: [{ kind: "text", value: groups.linkText }],
        ...(classification.linkType === "doc-to-external" ? { external: true } : {}),
        ...(classification.anchor ? { resolvedAnchor: classification.anchor } : {})
      });
    } else if (groups.roleName && groups.roleValue) {
      const role = groups.roleName;
      const target = groups.roleValue;
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
      } else if (role === "math") {
        nodes.push({
          kind: "math-inline",
          value: target,
          dialect: "latex",
          delimiter: "\\("
        });
      } else {
        nodes.push({ kind: "inline-code", value: target });
      }
    } else if (groups.codeValue) {
      nodes.push({ kind: "inline-code", value: groups.codeValue });
    } else if (groups.parenMathValue) {
      nodes.push({
        kind: "math-inline",
        value: groups.parenMathValue,
        dialect: "latex",
        delimiter: "\\("
      });
    } else if (groups.dollarMathValue) {
      nodes.push({
        kind: "math-inline",
        value: groups.dollarMathValue,
        dialect: "latex",
        delimiter: "$"
      });
    } else if (groups.strongValue) {
      nodes.push({ kind: "strong", children: [{ kind: "text", value: groups.strongValue }] });
    } else if (groups.emphasisValue) {
      nodes.push({ kind: "emphasis", children: [{ kind: "text", value: groups.emphasisValue }] });
    }

    cursor = index + match[0].length;
  }

  if (cursor < text.length) {
    nodes.push({ kind: "text", value: text.slice(cursor) });
  }

  return nodes.length > 0 ? nodes : [{ kind: "text", value: text }];
}
