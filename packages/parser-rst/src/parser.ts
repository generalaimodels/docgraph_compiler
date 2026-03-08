import type { IRBuilder, ParseContext } from "@docgraph/core-ir";
import { makeNodeIdAuto } from "@docgraph/core-ir";
import type { BlockNode } from "@docgraph/core-types";
import { resolveRelativeRepoPath } from "@docgraph/security";
import { inlineText, parseInlineRst } from "./inline-rst.js";

const HEADING_CHARS = new Map<string, 1 | 2 | 3 | 4 | 5 | 6>([
  ["=", 1],
  ["-", 2],
  ["~", 3],
  ["^", 4],
  ['"', 5],
  ["*", 6]
]);

function isAdornment(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3) {
    return false;
  }

  return [...trimmed].every((character) => character === trimmed[0]);
}

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/gu, "")
    .replace(/\s+/gu, "-")
    .replace(/-+/gu, "-");
}

function dedent(lines: readonly string[]): string[] {
  const nonEmpty = lines.filter((line) => line.trim().length > 0);
  const minIndent = nonEmpty.reduce((minimum, line) => {
    const indent = line.match(/^\s*/u)?.[0].length ?? 0;
    return Math.min(minimum, indent);
  }, Number.POSITIVE_INFINITY);

  if (!Number.isFinite(minIndent)) {
    return [...lines];
  }

  return lines.map((line) => line.slice(minIndent));
}

function createMathBlock(value: string, delimiter: "$$" | "\\[" | "raw"): BlockNode {
  return {
    kind: "math-block",
    nodeId: makeNodeIdAuto(),
    value,
    dialect: "latex",
    delimiter
  };
}

function extractStandaloneMath(source: string): { value: string; delimiter: "$$" | "\\[" } | null {
  const trimmed = source.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const bracketMatch = trimmed.match(/^\\\[\s*([\s\S]*?)\s*\\\]$/su);
  if (bracketMatch?.[1]) {
    return {
      value: bracketMatch[1].trim(),
      delimiter: "\\["
    };
  }

  const dollarMatch = trimmed.match(/^\$\$\s*([\s\S]*?)\s*\$\$$/su);
  if (dollarMatch?.[1]) {
    return {
      value: dollarMatch[1].trim(),
      delimiter: "$$"
    };
  }

  return null;
}

function collectIndentedBlock(lines: readonly string[], startIndex: number): { lines: string[]; nextIndex: number } {
  const block: string[] = [];
  let index = startIndex;
  let seenIndentedContent = false;

  while (index < lines.length) {
    const current = lines[index] ?? "";
    if (current.trim().length === 0) {
      block.push("");
      index += 1;
      continue;
    }

    const indent = current.match(/^\s*/u)?.[0].length ?? 0;
    if (indent === 0 && seenIndentedContent) {
      break;
    }

    if (indent > 0) {
      seenIndentedContent = true;
      block.push(current);
      index += 1;
      continue;
    }

    if (!seenIndentedContent) {
      break;
    }
  }

  return {
    lines: dedent(block),
    nextIndex: index
  };
}

function parseDirectiveBodyLines(lines: readonly string[]): { options: string[]; body: string[] } {
  const options: string[] = [];
  const body: string[] = [];
  let inOptions = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (inOptions && trimmed.startsWith(":")) {
      options.push(trimmed);
      continue;
    }

    if (trimmed.length === 0 && body.length === 0) {
      inOptions = false;
      continue;
    }

    inOptions = false;
    body.push(line);
  }

  return { options, body };
}

function createParagraph(text: string, builder: IRBuilder, sourceLine?: number): BlockNode {
  return {
    kind: "paragraph",
    nodeId: makeNodeIdAuto(),
    children: parseInlineRst(text, builder, sourceLine)
  };
}

function createList(entries: readonly string[], builder: IRBuilder, sourceLine?: number): BlockNode {
  return {
    kind: "list",
    nodeId: makeNodeIdAuto(),
    ordered: false,
    items: entries.map((entry) => ({
      kind: "list-item",
      nodeId: makeNodeIdAuto(),
      children: [
        {
          kind: "paragraph",
          nodeId: makeNodeIdAuto(),
          children: parseInlineRst(entry, builder, sourceLine)
        }
      ]
    }))
  };
}

function parseBulletEntries(lines: readonly string[], startIndex: number): { entries: string[]; nextIndex: number } {
  const entries: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const current = lines[index] ?? "";
    const match = current.match(/^\s*(?:[-*+]|\d+\.)\s+(.*)$/u);
    if (!match) {
      break;
    }

    const buffer = [match[1] ?? ""];
    index += 1;

    while (index < lines.length) {
      const continuation = lines[index] ?? "";
      if (continuation.trim().length === 0) {
        index += 1;
        break;
      }

      if (/^\s*(?:[-*+]|\d+\.)\s+/u.test(continuation)) {
        break;
      }

      buffer.push(continuation.trim());
      index += 1;
    }

    entries.push(buffer.join(" ").trim());
  }

  return { entries, nextIndex: index };
}

async function mapDirective(
  name: string,
  argument: string,
  bodyLines: readonly string[],
  builder: IRBuilder,
  ctx: ParseContext,
  sourceLine: number
): Promise<BlockNode[]> {
  const { options, body } = parseDirectiveBodyLines(bodyLines);
  const lower = name.toLowerCase();

  if (["note", "warning", "tip", "important", "danger", "caution"].includes(lower)) {
    return [
      {
        kind: "callout",
        nodeId: makeNodeIdAuto(),
        calloutType: lower === "caution" ? "warning" : lower,
        children: await parseRstBlocks(body.join("\n"), builder, ctx)
      }
    ];
  }

  if (["code-block", "code", "literalinclude"].includes(lower)) {
    let value = dedent(body).join("\n").trimEnd();
    if (lower === "literalinclude" && argument.trim().length > 0) {
      try {
        const resolved = await ctx.resolveRelativePath(argument.trim());
        if (resolved) {
          value = new TextDecoder().decode(resolved.bytes);
        }
      } catch {
        builder.addDiagnostic({
          severity: "warning",
          code: "RST_LITERALINCLUDE_RESOLVE_FAILED",
          message: `Unable to resolve literalinclude target "${argument.trim()}".`,
          recoverable: true
        });
      }
    }

    return [
      {
        kind: "code-block",
        nodeId: makeNodeIdAuto(),
        value,
        ...(argument.trim().length > 0 && lower !== "literalinclude" ? { language: argument.trim() } : {})
      }
    ];
  }

  if (lower === "math") {
    const value = dedent(body).join("\n").trim();
    if (value.length === 0) {
      return [];
    }

    return [createMathBlock(value, "raw")];
  }

  if (["image", "figure"].includes(lower)) {
    return [
      {
        kind: "media-block",
        nodeId: makeNodeIdAuto(),
        mediaType: "image",
        src: argument.trim(),
        ...(body[0]?.trim() ? { title: body[0].trim() } : {})
      }
    ];
  }

  if (["toctree", "autosummary"].includes(lower)) {
    const entries = body
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith(":"));
    if (entries.length === 0) {
      return [];
    }
    return [createList(entries, builder, sourceLine)];
  }

  if (["automodule", "autoclass", "autofunction", "autodata", "currentmodule", "module", "class", "function"].includes(lower)) {
    const label = argument.trim() || lower;
    return [
      {
        kind: "callout",
        nodeId: makeNodeIdAuto(),
        calloutType: "info",
        title: [{ kind: "text", value: "API Symbol" }],
        children: [
          {
            kind: "paragraph",
            nodeId: makeNodeIdAuto(),
            children: [{ kind: "inline-code", value: label }]
          }
        ]
      }
    ];
  }

  if (lower === "include" && argument.trim().length > 0) {
    try {
      const resolved = await ctx.resolveRelativePath(argument.trim());
      if (resolved) {
        const included = new TextDecoder().decode(resolved.bytes);
        return parseRstBlocks(included, builder, ctx);
      }
    } catch {
      builder.addDiagnostic({
        severity: "warning",
        code: "RST_INCLUDE_RESOLVE_FAILED",
        message: `Unable to resolve include target "${argument.trim()}".`,
        recoverable: true
      });
    }
  }

  if (lower === "raw") {
    const rawFormat = argument.trim().toLowerCase();
    const rawContent = body.join("\n").trim();
    if (["latex", "tex", "math"].includes(rawFormat) && rawContent.length > 0) {
      const extracted = extractStandaloneMath(rawContent);
      return [createMathBlock(extracted?.value ?? rawContent, extracted?.delimiter ?? "raw")];
    }

    return [
      {
        kind: "raw-embed",
        nodeId: makeNodeIdAuto(),
        originalFormat: "rst",
        raw: body.join("\n"),
        reason: `Raw directive preserved: ${name}`
      }
    ];
  }

  if (body.length > 0) {
    return [createParagraph([`[${name}]`, argument, ...options, ...body].filter(Boolean).join(" "), builder, sourceLine)];
  }

  builder.addDiagnostic({
    severity: "info",
    code: "RST_DIRECTIVE_SKIPPED",
    message: `Directive "${name}" was represented as metadata.`,
    recoverable: true
  });
  return [];
}

export async function parseRstBlocks(source: string, builder: IRBuilder, ctx: ParseContext): Promise<BlockNode[]> {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const blocks: BlockNode[] = [];
  let index = 0;
  let titleAssigned = false;

  while (index < lines.length) {
    const current = lines[index] ?? "";
    const trimmed = current.trim();

    if (trimmed.length === 0) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith(":") && trimmed.endsWith(":") && !trimmed.includes(" ")) {
      builder.mergeMetadata({ [trimmed.slice(1, -1)]: true });
      index += 1;
      continue;
    }

    const next = lines[index + 1] ?? "";
    const nextAdornmentChar = next.trim().at(0);
    if (trimmed.length > 0 && nextAdornmentChar && isAdornment(next) && HEADING_CHARS.has(nextAdornmentChar)) {
      const level = HEADING_CHARS.get(nextAdornmentChar) ?? 2;
      const children = parseInlineRst(trimmed, builder, index + 1);
      if (!titleAssigned && level === 1) {
        builder.setTitle(inlineText(children));
        titleAssigned = true;
      }
      blocks.push({
        kind: "heading",
        nodeId: makeNodeIdAuto(),
        level,
        slug: slugify(trimmed),
        children
      });
      index += 2;
      continue;
    }

    const directiveMatch = current.match(/^\s*\.\.\s+([a-zA-Z0-9_.:-]+)::\s*(.*)$/u);
    if (directiveMatch) {
      const { lines: bodyLines, nextIndex } = collectIndentedBlock(lines, index + 1);
      blocks.push(
        ...(await mapDirective(
          directiveMatch[1] ?? "unknown",
          directiveMatch[2] ?? "",
          bodyLines,
          builder,
          ctx,
          index + 1
        ))
      );
      index = nextIndex;
      continue;
    }

    if (/^\s*(?:[-*+]|\d+\.)\s+/u.test(current)) {
      const { entries, nextIndex } = parseBulletEntries(lines, index);
      blocks.push(createList(entries, builder, index + 1));
      index = nextIndex;
      continue;
    }

    const paragraphLines: string[] = [trimmed];
    let paragraphIndex = index + 1;
    while (paragraphIndex < lines.length) {
      const candidate = lines[paragraphIndex] ?? "";
      if (candidate.trim().length === 0) {
        break;
      }
      if (isAdornment(lines[paragraphIndex + 1] ?? "") || /^\s*\.\.\s+[a-zA-Z0-9_.:-]+::/u.test(candidate) || /^\s*(?:[-*+]|\d+\.)\s+/u.test(candidate)) {
        break;
      }
      paragraphLines.push(candidate.trim());
      paragraphIndex += 1;
    }

    const paragraphSource = paragraphLines.join("\n");
    const standaloneMath = extractStandaloneMath(paragraphSource);
    if (standaloneMath) {
      blocks.push(createMathBlock(standaloneMath.value, standaloneMath.delimiter));
      index = paragraphIndex;
      continue;
    }

    const paragraphText = paragraphLines.join(" ");
    if (paragraphText.endsWith("::")) {
      const { lines: literalLines, nextIndex } = collectIndentedBlock(lines, paragraphIndex);
      blocks.push(
        createParagraph(paragraphText.slice(0, -2).trimEnd(), builder, index + 1),
        {
          kind: "code-block",
          nodeId: makeNodeIdAuto(),
          value: dedent(literalLines).join("\n").trimEnd()
        }
      );
      index = nextIndex;
      continue;
    }

    blocks.push(createParagraph(paragraphText, builder, index + 1));
    index = paragraphIndex;
  }

  return blocks;
}
