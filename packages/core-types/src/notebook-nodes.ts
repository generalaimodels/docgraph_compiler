export type NotebookOutputType =
  | "text/plain"
  | "text/html"
  | "image/png"
  | "image/jpeg"
  | "image/svg+xml"
  | "application/json"
  | "application/vnd.vegalite.v5+json"
  | "stderr"
  | "error";

export interface NotebookOutputNode {
  kind: "notebook-output";
  outputType: NotebookOutputType;
  text?: string;
  data?: string;
  structured?: unknown;
  traceback?: string[];
  ename?: string;
  evalue?: string;
  executionCount?: number | null;
}
