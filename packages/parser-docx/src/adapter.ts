import mammoth from "mammoth";
import type { ParseContext, ParseResult, SniffResult, SourceAdapter, SourceDescriptor } from "@docgraph/core-ir";
import { IRBuilder, makeNodeIdAuto, repoProvenanceFromSource } from "@docgraph/core-ir";
import { populateBuilderFromHtmlFragment } from "@docgraph/parser-html";

export class DocxAdapter implements SourceAdapter {
  readonly name = "parser-docx";
  readonly version = "0.1.0";
  readonly format = "docx" as const;

  async sniff(input: SourceDescriptor): Promise<SniffResult> {
    if (input.extension !== ".docx") {
      return { accepted: false, confidence: 0 };
    }

    const isZipContainer =
      input.bytes[0] === 0x50 &&
      input.bytes[1] === 0x4b &&
      (input.bytes[2] === 0x03 || input.bytes[2] === 0x05 || input.bytes[2] === 0x07);

    return {
      accepted: true,
      confidence: isZipContainer ? 0.99 : 0.8,
      containerType: "zip"
    };
  }

  async parse(ctx: ParseContext): Promise<ParseResult> {
    const builder = new IRBuilder();
    const repo = repoProvenanceFromSource(ctx.source);
    builder.setProvenance({
      sourceFormat: "docx",
      parser: {
        name: this.name,
        version: this.version
      },
      parsedAt: new Date().toISOString(),
      ...(repo ? { repo } : {})
    });

    try {
      const result = await mammoth.convertToHtml({
        buffer: Buffer.from(ctx.source.bytes)
      });

      for (const message of result.messages) {
        builder.addDiagnostic({
          severity: message.type === "warning" ? "warning" : "info",
          code: "DOCX_CONVERSION_MESSAGE",
          message: message.message,
          recoverable: true
        });
      }

      const blocks = populateBuilderFromHtmlFragment(result.value, builder);
      if (blocks.length === 0) {
        builder.addBlock({
          kind: "raw-embed",
          nodeId: makeNodeIdAuto(),
          originalFormat: "docx",
          raw: result.value,
          reason: "DOCX conversion produced no semantic HTML blocks"
        });
      } else {
        builder.addBlocks(blocks);
      }

      return {
        ir: builder.build(),
        rawAst: result.value
      };
    } catch (error) {
      builder.addDiagnostic({
        severity: "error",
        code: "DOCX_PARSE_FAILURE",
        message: String(error),
        recoverable: true
      });
      builder.addBlock({
        kind: "raw-embed",
        nodeId: makeNodeIdAuto(),
        originalFormat: "docx",
        rawBinary: Buffer.from(ctx.source.bytes).toString("base64"),
        raw: "",
        reason: "DOCX parsing failed; binary payload preserved"
      });
      return { ir: builder.build() };
    }
  }
}
