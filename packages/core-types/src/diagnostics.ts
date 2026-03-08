import type { DiagnosticId, NodeId } from "./identifiers.js";

export type DiagnosticSeverity = "info" | "warning" | "error";

export interface Diagnostic {
  id: DiagnosticId;
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  nodeId?: NodeId;
  recoverable: boolean;
  payload?: Record<string, unknown>;
}
