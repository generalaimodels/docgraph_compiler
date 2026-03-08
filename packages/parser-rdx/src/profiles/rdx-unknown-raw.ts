import type { ParseContext, ParseResult } from "@docgraph/core-ir";
import { IRBuilder, makeNodeIdAuto, repoProvenanceFromSource } from "@docgraph/core-ir";

export class RdxUnknownRawParser {
  async parse(ctx: ParseContext, profile: string): Promise<ParseResult> {
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
    builder.addDiagnostic({
      severity: "warning",
      code: "RDX_UNKNOWN_PROFILE",
      message: "RDX content did not match a known structured profile and was preserved as raw content.",
      recoverable: true
    });
    builder.addBlock({
      kind: "raw-embed",
      nodeId: makeNodeIdAuto(),
      originalFormat: profile,
      raw: new TextDecoder().decode(ctx.source.bytes),
      rawBinary: Buffer.from(ctx.source.bytes).toString("base64"),
      reason: "Unknown RDX profile preserved"
    });
    return { ir: builder.build() };
  }
}
