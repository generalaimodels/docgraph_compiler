export function detectSignature(bytes: Uint8Array): { recognized: boolean; profile?: string } {
  const head = Buffer.from(bytes.slice(0, 16)).toString("ascii");

  if (head.startsWith("RDX1")) {
    return { recognized: true, profile: "rdx-binary-legacy-v1" };
  }

  return { recognized: false };
}
