export class ProfileClassifier {
  classifyJson(parsed: unknown): { name: string; confidence: number } {
    if (typeof parsed !== "object" || parsed === null) {
      return { name: "rdx-unknown-raw", confidence: 0.3 };
    }

    const object = parsed as Record<string, unknown>;
    if (object.rdxVersion === 1 || Array.isArray(object.blocks) || Array.isArray(object.content)) {
      return { name: "rdx-json-v1", confidence: 0.96 };
    }

    return { name: "rdx-unknown-raw", confidence: 0.45 };
  }
}
