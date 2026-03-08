import type { NodeId } from "./identifiers.js";
import type { FormFieldNode } from "./form-nodes.js";
import type { InlineNode } from "./inline-nodes.js";
import type { NotebookOutputNode } from "./notebook-nodes.js";

export interface HeadingNode {
  kind: "heading";
  nodeId: NodeId;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  slug: string;
  children: InlineNode[];
}

export interface ParagraphNode {
  kind: "paragraph";
  nodeId: NodeId;
  children: InlineNode[];
}

export interface ListNode {
  kind: "list";
  nodeId: NodeId;
  ordered: boolean;
  start?: number;
  items: ListItemNode[];
}

export interface ListItemNode {
  kind: "list-item";
  nodeId: NodeId;
  checked?: boolean | null;
  children: BlockNode[];
}

export interface TableNode {
  kind: "table";
  nodeId: NodeId;
  columns: TableColumnDef[];
  header: TableRowNode[];
  body: TableRowNode[];
  caption?: InlineNode[];
}

export interface TableColumnDef {
  align?: "left" | "center" | "right";
  width?: number;
}

export interface TableRowNode {
  kind: "table-row";
  nodeId: NodeId;
  cells: TableCellNode[];
}

export interface TableCellNode {
  kind: "table-cell";
  nodeId: NodeId;
  colspan?: number;
  rowspan?: number;
  children: InlineNode[];
}

export interface CodeBlockNode {
  kind: "code-block";
  nodeId: NodeId;
  language?: string;
  meta?: string;
  value: string;
  filename?: string;
  executable?: boolean;
  highlightLines?: number[];
}

export interface MathBlockNode {
  kind: "math-block";
  nodeId: NodeId;
  value: string;
  dialect: "latex";
  delimiter: "$$" | "\\[" | "fenced" | "raw";
}

export interface QuoteNode {
  kind: "quote";
  nodeId: NodeId;
  children: BlockNode[];
}

export interface CalloutNode {
  kind: "callout";
  nodeId: NodeId;
  calloutType: "note" | "tip" | "warning" | "danger" | "info" | string;
  title?: InlineNode[];
  children: BlockNode[];
}

export interface ThematicBreakNode {
  kind: "thematic-break";
  nodeId: NodeId;
}

export interface MediaBlockNode {
  kind: "media-block";
  nodeId: NodeId;
  mediaType: "image" | "video" | "audio" | "embed";
  src: string;
  alt?: string;
  title?: string;
  width?: number;
  height?: number;
  assetId?: string;
}

export interface FormNode {
  kind: "form";
  nodeId: NodeId;
  fields: FormFieldNode[];
  submitAction?: string;
  method?: "GET" | "POST";
}

export interface NotebookCellNode {
  kind: "notebook-cell";
  nodeId: NodeId;
  cellType: "markdown" | "code" | "raw";
  source: string;
  language?: string;
  outputs?: NotebookOutputNode[];
  executionCount?: number | null;
  metadata?: Record<string, unknown>;
  children?: BlockNode[];
}

export interface RawEmbedNode {
  kind: "raw-embed";
  nodeId: NodeId;
  originalFormat: string;
  raw: string;
  rawBinary?: string;
  reason: string;
}

export interface ComponentEmbedNode {
  kind: "component-embed";
  nodeId: NodeId;
  componentName: string;
  props: Record<string, unknown>;
  children?: BlockNode[];
  trusted: boolean;
}

export interface DefinitionListNode {
  kind: "definition-list";
  nodeId: NodeId;
  items: DefinitionItemNode[];
}

export interface DefinitionItemNode {
  kind: "definition-item";
  nodeId: NodeId;
  term: InlineNode[];
  definitions: BlockNode[][];
}

export interface FootnoteDefNode {
  kind: "footnote-def";
  nodeId: NodeId;
  identifier: string;
  label?: string;
  children: BlockNode[];
}

export type BlockNode =
  | HeadingNode
  | ParagraphNode
  | ListNode
  | ListItemNode
  | TableNode
  | CodeBlockNode
  | MathBlockNode
  | QuoteNode
  | CalloutNode
  | ThematicBreakNode
  | MediaBlockNode
  | FormNode
  | NotebookCellNode
  | RawEmbedNode
  | ComponentEmbedNode
  | DefinitionListNode
  | FootnoteDefNode;
