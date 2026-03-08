import type { ParseContext, ParseResult, SniffResult, SourceAdapter, SourceDescriptor } from "@docgraph/core-ir";
import { detectBinary } from "./sniff/detect-binary.js";
import { detectJson } from "./sniff/detect-json.js";
import { detectSignature } from "./sniff/detect-signature.js";
import { detectXml } from "./sniff/detect-xml.js";
import { detectZip } from "./sniff/detect-zip.js";
import { ProfileClassifier } from "./sniff/profile-classifier.js";
import { RdxBinaryLegacyV1Parser } from "./profiles/rdx-binary-legacy-v1.js";
import { RdxJsonV1Parser } from "./profiles/rdx-json-v1.js";
import { RdxUnknownRawParser } from "./profiles/rdx-unknown-raw.js";
import { RdxXmlV1Parser } from "./profiles/rdx-xml-v1.js";
import { RdxZipBundleV1Parser } from "./profiles/rdx-zip-bundle-v1.js";

export class RdxAdapter implements SourceAdapter {
  readonly name = "parser-rdx";
  readonly version = "0.1.0";
  readonly format = "rdx-custom" as const;

  private readonly classifier = new ProfileClassifier();
  private readonly profileParsers = new Map<string, { parse(ctx: ParseContext, profile: string): Promise<ParseResult> }>([
    ["rdx-json-v1", new RdxJsonV1Parser()],
    ["rdx-xml-v1", new RdxXmlV1Parser()],
    ["rdx-zip-bundle-v1", new RdxZipBundleV1Parser()],
    ["rdx-binary-legacy-v1", new RdxBinaryLegacyV1Parser()],
    ["rdx-unknown-raw", new RdxUnknownRawParser()]
  ]);

  async sniff(input: SourceDescriptor): Promise<SniffResult> {
    if (input.extension !== ".rdx") {
      return { accepted: false, confidence: 0 };
    }

    if (detectZip(input.bytes)) {
      return {
        accepted: true,
        confidence: 0.88,
        profile: "rdx-zip-bundle-v1",
        containerType: "zip"
      };
    }

    const json = detectJson(input.bytes);
    if (json.valid) {
      const profile = this.classifier.classifyJson(json.parsed);
      return {
        accepted: true,
        confidence: profile.confidence,
        profile: profile.name,
        containerType: "json"
      };
    }

    if (detectXml(input.bytes)) {
      return {
        accepted: true,
        confidence: 0.76,
        profile: "rdx-xml-v1",
        containerType: "xml"
      };
    }

    const signature = detectSignature(input.bytes);
    if (signature.recognized) {
      return {
        accepted: true,
        confidence: 0.66,
        containerType: "binary",
        ...(signature.profile ? { profile: signature.profile } : {})
      };
    }

    return {
      accepted: true,
      confidence: 0.35,
      profile: "rdx-unknown-raw",
      containerType: detectBinary(input.bytes) ? "binary" : "plain"
    };
  }

  async parse(ctx: ParseContext): Promise<ParseResult> {
    const sniff = await this.sniff(ctx.source);
    const profile = sniff.profile ?? "rdx-unknown-raw";
    const parser = this.profileParsers.get(profile) ?? this.profileParsers.get("rdx-unknown-raw");
    if (!parser) {
      throw new Error("No parser available for RDX profile resolution.");
    }
    return parser.parse(ctx, profile);
  }
}
