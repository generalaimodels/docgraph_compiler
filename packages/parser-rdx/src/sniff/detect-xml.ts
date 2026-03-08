export function detectXml(bytes: Uint8Array): boolean {
  const text = new TextDecoder().decode(bytes.slice(0, 512)).trim();
  return text.startsWith("<?xml") || /^<[A-Za-z][\w:-]*/u.test(text);
}
