import type { ParseContext, ParseResult } from "@docgraph/core-ir";
import { IRBuilder, makeNodeIdAuto, repoProvenanceFromSource } from "@docgraph/core-ir";

function extractTagValues(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "giu");
  return [...xml.matchAll(pattern)].map((match) => match[1]?.trim() ?? "").filter(Boolean);
}

export class RdxXmlV1Parser {
  async parse(ctx: ParseContext, profile: string): Promise<ParseResult> {
    const xml = new TextDecoder().decode(ctx.source.bytes);
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

    let blockCount = 0;
    const titles = extractTagValues(xml, "title");
    if (titles[0]) {
      builder.setTitle(titles[0]);
    }

    for (const heading of extractTagValues(xml, "heading")) {
      blockCount += 1;
      builder.addBlock({
        kind: "heading",
        nodeId: makeNodeIdAuto(),
        level: 1,
        slug: heading.toLowerCase().replace(/\s+/gu, "-"),
        children: [{ kind: "text", value: heading }]
      });
    }

    for (const paragraph of extractTagValues(xml, "paragraph")) {
      blockCount += 1;
      builder.addBlock({
        kind: "paragraph",
        nodeId: makeNodeIdAuto(),
        children: [{ kind: "text", value: paragraph.replace(/<[^>]+>/gu, "") }]
      });
    }

    for (const code of extractTagValues(xml, "code")) {
      blockCount += 1;
      builder.addBlock({
        kind: "code-block",
        nodeId: makeNodeIdAuto(),
        value: code
      });
    }

    if (blockCount === 0) {
      builder.addBlock({
        kind: "raw-embed",
        nodeId: makeNodeIdAuto(),
        originalFormat: profile,
        raw: xml,
        reason: "RDX XML structure did not match the semantic extractor"
      });
    }

    return {
      ir: builder.build(),
      rawAst: xml
    };
  }
}
