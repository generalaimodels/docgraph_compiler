import type { ParseContext, ParseResult, SniffResult, SourceAdapter, SourceDescriptor } from "@docgraph/core-ir";
import { IRBuilder, repoProvenanceFromSource } from "@docgraph/core-ir";
import { populateBuilderFromHtmlFragment } from "./hast-to-ir.js";

export class HtmlAdapter implements SourceAdapter {
  readonly name = "parser-html";
  readonly version = "0.1.0";
  readonly format = "html" as const;

  async sniff(input: SourceDescriptor): Promise<SniffResult> {
    const sample = new TextDecoder().decode(input.bytes.slice(0, 128));
    const looksLikeHtml = /^<!doctype html|^<html|^<body|^<div|^<h1/u.test(sample.trim());

    return {
      accepted: looksLikeHtml,
      confidence: looksLikeHtml ? 0.7 : 0,
      containerType: "plain"
    };
  }

  async parse(ctx: ParseContext): Promise<ParseResult> {
    const html = new TextDecoder().decode(ctx.source.bytes);
    const builder = new IRBuilder();
    const repo = repoProvenanceFromSource(ctx.source);
    builder.setProvenance({
      sourceFormat: "html",
      parser: {
        name: this.name,
        version: this.version
      },
      parsedAt: new Date().toISOString(),
      ...(repo ? { repo } : {})
    });
    builder.addBlocks(populateBuilderFromHtmlFragment(html, builder));
    return { ir: builder.build(), rawAst: html };
  }
}
