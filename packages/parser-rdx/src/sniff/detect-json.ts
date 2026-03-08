export function detectJson(bytes: Uint8Array): { valid: boolean; parsed?: unknown } {
  const text = new TextDecoder().decode(bytes).trim();
  if (!text.startsWith("{") && !text.startsWith("[")) {
    return { valid: false };
  }

  try {
    return { valid: true, parsed: JSON.parse(text) };
  } catch {
    return { valid: false };
  }
}
