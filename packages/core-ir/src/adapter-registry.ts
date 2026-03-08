import type { SniffResult, SourceAdapter, SourceDescriptor } from "./adapter-contract.js";

export class AdapterRegistry {
  private readonly adapters: SourceAdapter[] = [];

  register(adapter: SourceAdapter): void {
    this.adapters.push(adapter);
  }

  registerMany(adapters: readonly SourceAdapter[]): void {
    for (const adapter of adapters) {
      this.register(adapter);
    }
  }

  async resolve(
    input: SourceDescriptor
  ): Promise<{ adapter: SourceAdapter; sniff: SniffResult } | null> {
    const candidates: Array<{ adapter: SourceAdapter; sniff: SniffResult }> = [];

    for (const adapter of this.adapters) {
      try {
        const sniff = await adapter.sniff(input);
        if (sniff.accepted) {
          candidates.push({ adapter, sniff });
        }
      } catch {
        continue;
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((left, right) => right.sniff.confidence - left.sniff.confidence);
    return candidates[0] ?? null;
  }
}
