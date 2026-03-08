import type { ParseContext, ParseResult, SniffResult, SourceAdapter, SourceDescriptor } from "@docgraph/core-ir";
import { IRBuilder, repoProvenanceFromSource } from "@docgraph/core-ir";
import { parseRstBlocks } from "./parser.js";

export class RstAdapter implements SourceAdapter {
  readonly name = "parser-rst";
  readonly version = "0.1.0";
  readonly format = "rst" as const;

  async sniff(input: SourceDescriptor): Promise<SniffResult> {
    if (input.extension === ".rst") {
      return { accepted: true, confidence: 0.99, containerType: "plain" };
    }

    const sample = new TextDecoder().decode(input.bytes.slice(0, 512));
    const looksLikeRst =
      /^\.\.\s+[a-zA-Z0-9_.:-]+::/mu.test(sample) ||
      /^:[a-zA-Z0-9_-]+:/mu.test(sample) ||
      /^.+\n[-=~^"*]{3,}$/mu.test(sample);

    return {
      accepted: looksLikeRst,
      confidence: looksLikeRst ? 0.58 : 0,
      containerType: "plain"
    };
  }

  async parse(ctx: ParseContext): Promise<ParseResult> {
    const text = new TextDecoder().decode(ctx.source.bytes);
    const builder = new IRBuilder();
    const repo = repoProvenanceFromSource(ctx.source);

    builder.setProvenance({
      sourceFormat: "rst",
      parser: {
        name: this.name,
        version: this.version
      },
      parsedAt: new Date().toISOString(),
      ...(repo ? { repo } : {})
    });

    builder.addBlocks(await parseRstBlocks(text, builder, ctx));

    return {
      ir: builder.build(),
      rawAst: text
    };
  }
}
