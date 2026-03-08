import type { ParseContext, ParseResult } from "@docgraph/core-ir";
import { IRBuilder, makeNodeIdAuto, repoProvenanceFromSource } from "@docgraph/core-ir";

export class RdxJsonV1Parser {
  async parse(ctx: ParseContext, profile: string): Promise<ParseResult> {
    const text = new TextDecoder().decode(ctx.source.bytes);
    const builder = new IRBuilder();
    const repo = repoProvenanceFromSource(ctx.source);
    builder.setProvenance({
      sourceFormat: "rdx-custom",
      parser: {
        name: "parser-rdx",
        version: "0.1.0",
        profile
      },
      parsedAt: new Date().toISOString(),
      ...(repo ? { repo } : {})
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      builder.addDiagnostic({
        severity: "error",
        code: "RDX_JSON_PARSE_FAILURE",
        message: String(error),
        recoverable: true
      });
      builder.addBlock({
        kind: "raw-embed",
        nodeId: makeNodeIdAuto(),
        originalFormat: profile,
        raw: text,
        reason: "RDX JSON parse failure"
      });
      return { ir: builder.build() };
    }

    if (typeof parsed === "object" && parsed !== null) {
      const object = parsed as Record<string, unknown>;
      builder.mergeMetadata(object);

      if (typeof object.title === "string") {
        builder.setTitle(object.title);
      }

      const blocks = Array.isArray(object.content) ? object.content : Array.isArray(object.blocks) ? object.blocks : [];
      for (const block of blocks) {
        this.extractBlock(block, builder);
      }
    } else {
      builder.addBlock({
        kind: "raw-embed",
        nodeId: makeNodeIdAuto(),
        originalFormat: profile,
        raw: text,
        reason: "Scalar JSON payload preserved as raw embed"
      });
    }

    return { ir: builder.build(), rawAst: parsed };
  }

  private extractBlock(value: unknown, builder: IRBuilder): void {
    if (typeof value !== "object" || value === null) {
      builder.addBlock({
        kind: "raw-embed",
        nodeId: makeNodeIdAuto(),
        originalFormat: "rdx-json-v1",
        raw: JSON.stringify(value),
        reason: "Non-object block preserved"
      });
      return;
    }

    const block = value as Record<string, unknown>;
    const kind = String(block.type ?? block.kind ?? block.tag ?? "");

    switch (kind) {
      case "heading":
        builder.addBlock({
          kind: "heading",
          nodeId: makeNodeIdAuto(),
          level: (Number(block.level) || 1) as 1 | 2 | 3 | 4 | 5 | 6,
          slug: String(block.slug ?? block.id ?? block.text ?? ""),
          children: [{ kind: "text", value: String(block.text ?? block.content ?? "") }]
        });
        break;
      case "paragraph":
      case "text":
        builder.addBlock({
          kind: "paragraph",
          nodeId: makeNodeIdAuto(),
          children: [{ kind: "text", value: String(block.text ?? block.content ?? "") }]
        });
        break;
      case "code":
        builder.addBlock({
          kind: "code-block",
          nodeId: makeNodeIdAuto(),
          value: String(block.value ?? block.source ?? block.code ?? ""),
          ...(typeof block.language === "string" ? { language: block.language } : {})
        });
        break;
      default:
        builder.addDiagnostic({
          severity: "warning",
          code: "RDX_UNKNOWN_BLOCK_TYPE",
          message: `Unsupported RDX block type "${kind}" was preserved as raw data.`,
          recoverable: true
        });
        builder.addBlock({
          kind: "raw-embed",
          nodeId: makeNodeIdAuto(),
          originalFormat: "rdx-json-v1",
          raw: JSON.stringify(block, null, 2),
          reason: `Unsupported RDX block type: ${kind}`
        });
    }
  }
}
