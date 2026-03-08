import type { ParseContext, ParseResult, SniffResult, SourceAdapter, SourceDescriptor } from "@docgraph/core-ir";
import { IRBuilder, makeNodeIdAuto, repoProvenanceFromSource } from "@docgraph/core-ir";
import type { NotebookOutputNode } from "@docgraph/core-types";
import { parseMarkdownBlocks } from "@docgraph/parser-md";

type NotebookCell = {
  cell_type?: "markdown" | "code" | "raw";
  source?: string | string[];
  outputs?: unknown[];
  execution_count?: number | null;
  metadata?: Record<string, unknown>;
};

type NotebookDocument = {
  nbformat?: number;
  nbformat_minor?: number;
  metadata?: Record<string, unknown>;
  cells?: NotebookCell[];
};

export class IpynbAdapter implements SourceAdapter {
  readonly name = "parser-ipynb";
  readonly version = "0.1.0";
  readonly format = "ipynb" as const;

  async sniff(input: SourceDescriptor): Promise<SniffResult> {
    if (input.extension !== ".ipynb") {
      return { accepted: false, confidence: 0 };
    }

    try {
      const text = new TextDecoder().decode(input.bytes.slice(0, 4096));
      const partial = JSON.parse(text);
      const looksLikeNotebook = typeof partial === "object" && partial !== null && ("cells" in partial || "nbformat" in partial);
      return {
        accepted: looksLikeNotebook,
        confidence: looksLikeNotebook ? 0.99 : 0.4,
        containerType: "json"
      };
    } catch {
      return { accepted: true, confidence: 0.55, containerType: "json" };
    }
  }

  async parse(ctx: ParseContext): Promise<ParseResult> {
    const text = new TextDecoder().decode(ctx.source.bytes);
    const builder = new IRBuilder();
    const repo = repoProvenanceFromSource(ctx.source);
    builder.setProvenance({
      sourceFormat: "ipynb",
      parser: {
        name: this.name,
        version: this.version
      },
      parsedAt: new Date().toISOString(),
      ...(repo ? { repo } : {})
    });

    let notebook: NotebookDocument;
    try {
      notebook = JSON.parse(text) as NotebookDocument;
    } catch (error) {
      builder.addDiagnostic({
        severity: "error",
        code: "IPYNB_JSON_PARSE_FAILURE",
        message: String(error),
        recoverable: true
      });
      builder.addBlock({
        kind: "raw-embed",
        nodeId: makeNodeIdAuto(),
        originalFormat: "ipynb",
        raw: text,
        reason: "Notebook JSON parse failure"
      });
      return { ir: builder.build() };
    }

    const notebookMetadata = notebook.metadata ?? {};
    const kernelspec =
      typeof notebookMetadata.kernelspec === "object" && notebookMetadata.kernelspec !== null
        ? (notebookMetadata.kernelspec as Record<string, unknown>)
        : {};
    const languageInfo =
      typeof notebookMetadata.language_info === "object" && notebookMetadata.language_info !== null
        ? (notebookMetadata.language_info as Record<string, unknown>)
        : {};

    builder.mergeMetadata({
      nbformat: notebook.nbformat ?? 4,
      nbformatMinor: notebook.nbformat_minor ?? 0,
      ...notebookMetadata
    });

    if ((notebook.nbformat ?? 4) < 4) {
      builder.addDiagnostic({
        severity: "warning",
        code: "IPYNB_LEGACY_FORMAT",
        message: `Notebook version ${notebook.nbformat ?? 0} is being parsed in best-effort mode.`,
        recoverable: true
      });
    }

    const cells = notebook.cells ?? [];
    for (const [index, cell] of cells.entries()) {
      const cellType = cell.cell_type ?? "raw";
      const source = Array.isArray(cell.source) ? cell.source.join("") : cell.source ?? "";
      const children = cellType === "markdown" ? parseMarkdownBlocks(source, builder, ctx, index === 0).blocks : undefined;

      builder.addBlock({
        kind: "notebook-cell",
        nodeId: makeNodeIdAuto(),
        cellType,
        source,
        ...(cellType === "code"
          ? {
              language: String(kernelspec.language ?? languageInfo.name ?? "python")
            }
          : {}),
        ...(Array.isArray(cell.outputs) ? { outputs: cell.outputs.map((output) => this.normalizeOutput(output)) } : {}),
        executionCount: cell.execution_count ?? null,
        ...(cell.metadata ? { metadata: cell.metadata } : {}),
        ...(children ? { children } : {})
      });
    }

    return {
      ir: builder.build(),
      rawAst: notebook
    };
  }

  private normalizeOutput(output: unknown): NotebookOutputNode {
    if (typeof output !== "object" || output === null) {
      return {
        kind: "notebook-output",
        outputType: "text/plain",
        text: JSON.stringify(output)
      };
    }

    const normalized = output as {
      output_type?: string;
      name?: string;
      text?: string | string[];
      data?: Record<string, unknown>;
      ename?: string;
      evalue?: string;
      traceback?: string[];
      execution_count?: number | null;
    };

    if (normalized.output_type === "stream") {
      return {
        kind: "notebook-output",
        outputType: normalized.name === "stderr" ? "stderr" : "text/plain",
        text: Array.isArray(normalized.text) ? normalized.text.join("") : String(normalized.text ?? "")
      };
    }

    if (normalized.output_type === "error") {
      return {
        kind: "notebook-output",
        outputType: "error",
        ...(normalized.ename ? { ename: normalized.ename } : {}),
        ...(normalized.evalue ? { evalue: normalized.evalue } : {}),
        ...(normalized.traceback ? { traceback: normalized.traceback } : {})
      };
    }

    const data = normalized.data ?? {};
    if (typeof data["image/png"] === "string") {
      return {
        kind: "notebook-output",
        outputType: "image/png",
        data: data["image/png"],
        executionCount: normalized.execution_count ?? null
      };
    }

    if (typeof data["text/html"] === "string") {
      return {
        kind: "notebook-output",
        outputType: "text/html",
        text: data["text/html"],
        executionCount: normalized.execution_count ?? null
      };
    }

    if (typeof data["application/json"] !== "undefined") {
      return {
        kind: "notebook-output",
        outputType: "application/json",
        structured: data["application/json"],
        executionCount: normalized.execution_count ?? null
      };
    }

    return {
      kind: "notebook-output",
      outputType: "text/plain",
      text: Array.isArray(normalized.text) ? normalized.text.join("") : String(data["text/plain"] ?? normalized.text ?? ""),
      executionCount: normalized.execution_count ?? null
    };
  }
}
