import matter from "gray-matter";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { IRBuilder, ParseContext } from "@docgraph/core-ir";
import { mapMdastRootToBuilder } from "./mdast-to-ir.js";
import { preNormalizeMath } from "./math-pre-normalize.js";

const markdownProcessor = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkFrontmatter);

export function parseMarkdownBlocks(
  rawText: string,
  builder: IRBuilder,
  ctx: ParseContext,
  allowTitleInference = true
) {
  const normalized = preNormalizeMath(rawText);
  const ast = markdownProcessor.parse(normalized) as { children?: unknown[] };
  const blocks = mapMdastRootToBuilder(ast as never, builder, ctx, { allowTitleInference });
  return { ast, blocks };
}

export function parseMarkdownDocument(
  rawText: string,
  builder: IRBuilder,
  ctx: ParseContext
) {
  const parsed = matter(rawText);
  const metadata = typeof parsed.data === "object" && parsed.data !== null ? parsed.data : {};
  builder.mergeMetadata(metadata as Record<string, unknown>);

  if (typeof parsed.data.title === "string") {
    builder.setTitle(parsed.data.title);
  }

  const { ast, blocks } = parseMarkdownBlocks(parsed.content, builder, ctx, typeof parsed.data.title !== "string");
  return {
    ast,
    blocks,
    metadata
  };
}
