import type { ParseContext, ParseResult } from "@docgraph/core-ir";
import { IRBuilder, makeNodeIdAuto, repoProvenanceFromSource } from "@docgraph/core-ir";

export class RdxZipBundleV1Parser {
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
      code: "RDX_ZIP_BUNDLE_PRESERVED",
      message: "ZIP-backed RDX content is preserved as a raw binary embed in the current implementation.",
      recoverable: true
    });
    builder.addBlock({
      kind: "raw-embed",
      nodeId: makeNodeIdAuto(),
      originalFormat: profile,
      raw: "",
      rawBinary: Buffer.from(ctx.source.bytes).toString("base64"),
      reason: "ZIP-backed RDX bundle preserved for future profile-specific handling"
    });
    return { ir: builder.build() };
  }
}
