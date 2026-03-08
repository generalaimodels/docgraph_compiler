import type { IRBuilder, ParseContext } from "@docgraph/core-ir";
import { makeNodeIdAuto } from "@docgraph/core-ir";
import type { BlockNode, InlineNode, LinkType } from "@docgraph/core-types";

interface MdNode {
  type: string;
  value?: string;
  depth?: number;
  ordered?: boolean;
  start?: number;
  checked?: boolean | null;
  lang?: string;
  meta?: string;
  url?: string;
  title?: string;
  alt?: string;
  identifier?: string;
  label?: string;
  name?: string;
  attributes?: Array<{ name?: string; value?: unknown }>;
  children?: MdNode[];
  position?: {
    start?: {
      line?: number;
    };
  };
}

interface TransformOptions {
  allowTitleInference?: boolean;
}

interface TransformState {
  titleAssigned: boolean;
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/gu, "")
    .replace(/\s+/gu, "-")
    .replace(/-+/gu, "-");
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
        case "link":
        case "emphasis":
        case "strong":
        case "strikethrough":
        case "highlight":
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
    .join("")
    .trim();
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

function serializeUnknownNode(node: MdNode): string {
  return JSON.stringify(node, null, 2);
}

function parseMdxProps(node: MdNode): Record<string, unknown> {
  const props: Record<string, unknown> = {};

  for (const attribute of node.attributes ?? []) {
    if (!attribute.name) {
      continue;
    }

    props[attribute.name] = attribute.value ?? true;
  }

  return props;
}

function asBlockChildren(
  nodes: readonly MdNode[] | undefined,
  builder: IRBuilder,
  ctx: ParseContext,
  options: TransformOptions,
  state: TransformState
): BlockNode[] {
  if (!nodes) {
    return [];
  }

  return nodes.flatMap((node) => mapBlockNode(node, builder, ctx, options, state));
}

function mapInlineNode(node: MdNode, builder: IRBuilder): InlineNode[] {
  switch (node.type) {
    case "text":
      return node.value ? [{ kind: "text", value: node.value }] : [];
    case "inlineCode":
      return [{ kind: "inline-code", value: node.value ?? "" }];
    case "emphasis":
      return [{ kind: "emphasis", children: mapInlineNodes(node.children, builder) }];
    case "strong":
      return [{ kind: "strong", children: mapInlineNodes(node.children, builder) }];
    case "delete":
      return [{ kind: "strikethrough", children: mapInlineNodes(node.children, builder) }];
    case "break":
      return [{ kind: "break" }];
    case "inlineMath":
      return [{ kind: "math-inline", value: node.value ?? "", dialect: "latex", delimiter: "$" }];
    case "link": {
      const href = node.url ?? "";
      const classification = classifyLink(href);
      builder.addLink({
        hrefRaw: href,
        linkType: classification.linkType,
        resolved: classification.resolved,
        ...(classification.anchor ? { anchor: classification.anchor } : {}),
        ...(node.position?.start?.line !== undefined ? { sourceLine: node.position.start.line } : {})
      });
      return [
        {
          kind: "link",
          href,
          children: mapInlineNodes(node.children, builder),
          ...(node.title ? { title: node.title } : {}),
          ...(classification.linkType === "doc-to-external" ? { external: true } : {}),
          ...(classification.anchor ? { resolvedAnchor: classification.anchor } : {})
        }
      ];
    }
    case "image": {
      const href = node.url ?? "";
      const classification = classifyLink(href);
      builder.addLink({
        hrefRaw: href,
        linkType: classification.linkType === "doc-to-external" ? "doc-to-external" : "doc-to-asset",
        resolved: classification.linkType === "doc-to-external",
        ...(classification.anchor ? { anchor: classification.anchor } : {}),
        ...(node.position?.start?.line !== undefined ? { sourceLine: node.position.start.line } : {})
      });
      return [
        {
          kind: "image",
          src: href,
          ...(node.alt ? { alt: node.alt } : {}),
          ...(node.title ? { title: node.title } : {})
        }
      ];
    }
    case "html":
      return [{ kind: "html-span", value: node.value ?? "", sanitized: false }];
    case "footnoteReference":
      return [{ kind: "footnote-ref", identifier: node.identifier ?? "", ...(node.label ? { label: node.label } : {}) }];
    case "mdxJsxTextElement":
      return [
        {
          kind: "html-span",
          value: `<${node.name ?? "Component"}>`,
          sanitized: false
        }
      ];
    case "mdxTextExpression":
      return [{ kind: "html-span", value: `{${node.value ?? ""}}`, sanitized: false }];
    default:
      return node.value ? [{ kind: "text", value: node.value }] : [];
  }
}

function mapInlineNodes(nodes: readonly MdNode[] | undefined, builder: IRBuilder): InlineNode[] {
  if (!nodes) {
    return [];
  }

  return nodes.flatMap((node) => mapInlineNode(node, builder));
}

function mapTableRows(nodes: readonly MdNode[] | undefined, builder: IRBuilder) {
  return (nodes ?? []).map((row) => ({
    kind: "table-row" as const,
    nodeId: makeNodeIdAuto(),
    cells: (row.children ?? []).map((cell) => ({
      kind: "table-cell" as const,
      nodeId: makeNodeIdAuto(),
      children: mapInlineNodes(cell.children, builder)
    }))
  }));
}

function mapBlockNode(
  node: MdNode,
  builder: IRBuilder,
  ctx: ParseContext,
  options: TransformOptions,
  state: TransformState
): BlockNode[] {
  switch (node.type) {
    case "heading": {
      const children = mapInlineNodes(node.children, builder);
      const title = inlineText(children);
      if (options.allowTitleInference && !state.titleAssigned && node.depth === 1 && title.length > 0) {
        builder.setTitle(title);
        state.titleAssigned = true;
      }
      return [
        {
          kind: "heading",
          nodeId: makeNodeIdAuto(),
          level: (node.depth ?? 1) as 1 | 2 | 3 | 4 | 5 | 6,
          slug: slugify(title),
          children
        }
      ];
    }
    case "paragraph":
      return [
        {
          kind: "paragraph",
          nodeId: makeNodeIdAuto(),
          children: mapInlineNodes(node.children, builder)
        }
      ];
    case "list":
      return [
        {
          kind: "list",
          nodeId: makeNodeIdAuto(),
          ordered: Boolean(node.ordered),
          ...(node.start !== undefined ? { start: node.start } : {}),
          items: (node.children ?? []).map((item) => ({
            kind: "list-item",
            nodeId: makeNodeIdAuto(),
            children: asBlockChildren(item.children, builder, ctx, options, state),
            ...(item.checked !== undefined ? { checked: item.checked } : {})
          }))
        }
      ];
    case "blockquote":
      return [
        {
          kind: "quote",
          nodeId: makeNodeIdAuto(),
          children: asBlockChildren(node.children, builder, ctx, options, state)
        }
      ];
    case "thematicBreak":
      return [{ kind: "thematic-break", nodeId: makeNodeIdAuto() }];
    case "code":
      return [
        {
          kind: "code-block",
          nodeId: makeNodeIdAuto(),
          value: node.value ?? "",
          ...(node.lang ? { language: node.lang } : {}),
          ...(node.meta ? { meta: node.meta } : {})
        }
      ];
    case "math":
      return [
        {
          kind: "math-block",
          nodeId: makeNodeIdAuto(),
          value: node.value ?? "",
          dialect: "latex",
          delimiter: "$$"
        }
      ];
    case "table": {
      const rows = node.children ?? [];
      const firstRow = rows[0];
      const header = firstRow ? mapTableRows([firstRow], builder) : [];
      const body = rows.length > 1 ? mapTableRows(rows.slice(1), builder) : [];
      const width = firstRow?.children?.length ?? 0;
      return [
        {
          kind: "table",
          nodeId: makeNodeIdAuto(),
          columns: Array.from({ length: width }, () => ({})),
          header,
          body
        }
      ];
    }
    case "footnoteDefinition":
      return [
        {
          kind: "footnote-def",
          nodeId: makeNodeIdAuto(),
          identifier: node.identifier ?? "",
          children: asBlockChildren(node.children, builder, ctx, options, state),
          ...(node.label ? { label: node.label } : {})
        }
      ];
    case "html":
      return [
        {
          kind: "raw-embed",
          nodeId: makeNodeIdAuto(),
          originalFormat: "html",
          raw: node.value ?? "",
          reason: "Raw HTML block preserved"
        }
      ];
    case "mdxJsxFlowElement":
      return [
        {
          kind: "component-embed",
          nodeId: makeNodeIdAuto(),
          componentName: node.name ?? "AnonymousComponent",
          props: parseMdxProps(node),
          children: asBlockChildren(node.children, builder, ctx, options, state),
          trusted: false
        }
      ];
    case "mdxjsEsm":
    case "mdxFlowExpression":
      builder.addDiagnostic({
        severity: "warning",
        code: "MDX_UNSAFE_CONSTRUCT_PRESERVED",
        message: `${node.type} was preserved as a raw embed.`,
        recoverable: true
      });
      return [
        {
          kind: "raw-embed",
          nodeId: makeNodeIdAuto(),
          originalFormat: "mdx",
          raw: node.value ?? serializeUnknownNode(node),
          reason: "MDX executable syntax preserved for safety"
        }
      ];
    default:
      if (node.children && node.children.length > 0) {
        return asBlockChildren(node.children, builder, ctx, options, state);
      }

      builder.addDiagnostic({
        severity: "warning",
        code: "MD_UNKNOWN_NODE",
        message: `Unsupported markdown node "${node.type}" was preserved as raw content.`,
        recoverable: true
      });
      return [
        {
          kind: "raw-embed",
          nodeId: makeNodeIdAuto(),
          originalFormat: "markdown",
          raw: serializeUnknownNode(node),
          reason: `Unsupported markdown node: ${node.type}`
        }
      ];
  }
}

export function mapMdastRootToBuilder(
  root: MdNode,
  builder: IRBuilder,
  ctx: ParseContext,
  options: TransformOptions = {}
): BlockNode[] {
  const state: TransformState = { titleAssigned: false };
  return asBlockChildren(root.children, builder, ctx, options, state);
}
