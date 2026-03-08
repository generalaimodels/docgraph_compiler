import { MAX_FILE_SIZE_BYTES } from "@docgraph/core-types";

export function assertWithinFileSizeLimit(
  bytes: Uint8Array,
  limitBytes = MAX_FILE_SIZE_BYTES
): void {
  if (bytes.byteLength > limitBytes) {
    throw new Error(`Input exceeds the ${limitBytes} byte limit.`);
  }
}
