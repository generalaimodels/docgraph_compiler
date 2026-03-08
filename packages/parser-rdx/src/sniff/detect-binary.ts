export function detectBinary(bytes: Uint8Array): boolean {
  const sampleLength = Math.min(bytes.length, 512);
  let suspiciousCount = 0;

  for (let index = 0; index < sampleLength; index += 1) {
    const value = bytes[index] ?? 0;
    if (value === 0 || (value < 9 || (value > 13 && value < 32))) {
      suspiciousCount += 1;
    }
  }

  return sampleLength > 0 && suspiciousCount / sampleLength > 0.05;
}
