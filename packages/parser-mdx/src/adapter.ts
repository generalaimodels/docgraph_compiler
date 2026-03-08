import matter from "gray-matter";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { ParseContext, ParseResult, SniffResult, SourceAdapter, SourceDescriptor } from "@docgraph/core-ir";
import { IRBuilder, repoProvenanceFromSource } from "@docgraph/core-ir";
import { mapMdastRootToBuilder, preNormalizeMath } from "@docgraph/parser-md";

const mdxProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkFrontmatter)
  .use(remarkMdx);

export class MdxAdapter implements SourceAdapter {
  readonly name = "parser-mdx";
  readonly version = "0.1.0";
  readonly format = "mdx" as const;

  async sniff(input: SourceDescriptor): Promise<SniffResult> {
    if (input.extension === ".mdx") {
      return { accepted: true, confidence: 0.99, containerType: "plain" };
    }

    const sample = new TextDecoder().decode(input.bytes.slice(0, 512));
    const looksLikeMdx = /<[A-Z][A-Za-z0-9]+/u.test(sample) || /^import\s.+from\s.+/mu.test(sample);

    return {
      accepted: looksLikeMdx,
      confidence: looksLikeMdx ? 0.55 : 0,
      containerType: "plain"
    };
  }

  async parse(ctx: ParseContext): Promise<ParseResult> {
    const rawText = new TextDecoder().decode(ctx.source.bytes);
    const parsed = matter(rawText);
    const normalized = preNormalizeMath(parsed.content);
    const ast = mdxProcessor.parse(normalized) as never;

    const builder = new IRBuilder();
    const repo = repoProvenanceFromSource(ctx.source);
    builder.setProvenance({
      sourceFormat: "mdx",
      parser: {
        name: this.name,
        version: this.version
      },
      parsedAt: new Date().toISOString(),
      ...(repo ? { repo } : {})
    });

    if (typeof parsed.data === "object" && parsed.data !== null) {
      builder.mergeMetadata(parsed.data as Record<string, unknown>);
    }

    if (typeof parsed.data.title === "string") {
      builder.setTitle(parsed.data.title);
    }

    builder.addBlocks(mapMdastRootToBuilder(ast as never, builder, ctx, { allowTitleInference: typeof parsed.data.title !== "string" }));

    return {
      ir: builder.build(),
      rawAst: ast
    };
  }
}
