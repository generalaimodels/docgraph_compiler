import { createHash } from "node:crypto";
import type { BlockNode } from "@docgraph/core-types";

export function computeCanonicalHash(blocks: readonly BlockNode[]): string {
  const serialized = JSON.stringify(blocks, (key, value) => {
    if (key === "nodeId") {
      return undefined;
    }

    return value;
  });

  return createHash("sha256").update(serialized).digest("hex");
}
