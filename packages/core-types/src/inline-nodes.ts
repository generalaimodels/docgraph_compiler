export interface TextNode {
  kind: "text";
  value: string;
}

export interface EmphasisNode {
  kind: "emphasis";
  children: InlineNode[];
}

export interface StrongNode {
  kind: "strong";
  children: InlineNode[];
}

export interface StrikethroughNode {
  kind: "strikethrough";
  children: InlineNode[];
}

export interface InlineCodeNode {
  kind: "inline-code";
  value: string;
}

export interface LinkNode {
  kind: "link";
  href: string;
  title?: string;
  children: InlineNode[];
  resolvedDocId?: string;
  resolvedAnchor?: string;
  external?: boolean;
}

export interface ImageNode {
  kind: "image";
  src: string;
  alt?: string;
  title?: string;
  width?: number;
  height?: number;
  assetId?: string;
}

export interface MathInlineNode {
  kind: "math-inline";
  value: string;
  dialect: "latex";
  delimiter: "$" | "\\(";
}

export interface FootnoteRefNode {
  kind: "footnote-ref";
  identifier: string;
  label?: string;
}

export interface BreakNode {
  kind: "break";
}

export interface HtmlSpanNode {
  kind: "html-span";
  value: string;
  sanitized: boolean;
}

export interface SuperscriptNode {
  kind: "superscript";
  children: InlineNode[];
}

export interface SubscriptNode {
  kind: "subscript";
  children: InlineNode[];
}

export interface HighlightNode {
  kind: "highlight";
  children: InlineNode[];
}

export type InlineNode =
  | TextNode
  | EmphasisNode
  | StrongNode
  | StrikethroughNode
  | InlineCodeNode
  | LinkNode
  | ImageNode
  | MathInlineNode
  | FootnoteRefNode
  | BreakNode
  | HtmlSpanNode
  | SuperscriptNode
  | SubscriptNode
  | HighlightNode;
