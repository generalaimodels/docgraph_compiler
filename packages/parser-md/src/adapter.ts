import type { ParseContext, ParseResult, SniffResult, SourceAdapter, SourceDescriptor } from "@docgraph/core-ir";
import { IRBuilder, repoProvenanceFromSource } from "@docgraph/core-ir";
import { parseMarkdownDocument } from "./markdown-to-ir.js";

export class MarkdownAdapter implements SourceAdapter {
  readonly name = "parser-md";
  readonly version = "0.1.0";
  readonly format = "md" as const;

  async sniff(input: SourceDescriptor): Promise<SniffResult> {
    if (input.extension === ".md") {
      return { accepted: true, confidence: 0.98, containerType: "plain" };
    }

    const sample = new TextDecoder().decode(input.bytes.slice(0, 256));
    const looksLikeMarkdown = /^(#{1,6}\s|\*\s|-\s|\d+\.\s)/mu.test(sample);

    return {
      accepted: looksLikeMarkdown,
      confidence: looksLikeMarkdown ? 0.45 : 0,
      containerType: "plain"
    };
  }

  async parse(ctx: ParseContext): Promise<ParseResult> {
    const text = new TextDecoder().decode(ctx.source.bytes);
    const builder = new IRBuilder();
    const repo = repoProvenanceFromSource(ctx.source);
    builder.setProvenance({
      sourceFormat: "md",
      parser: {
        name: this.name,
        version: this.version
      },
      parsedAt: new Date().toISOString(),
      ...(repo ? { repo } : {})
    });

    const { ast, blocks } = parseMarkdownDocument(text, builder, ctx);
    builder.addBlocks(blocks);

    return {
      ir: builder.build(),
      rawAst: ast
    };
  }
}
