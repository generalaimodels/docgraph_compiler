export function preNormalizeMath(input: string): string {
  return input
    .replace(/\\\((.+?)\\\)/gsu, (_match, content: string) => `$${content}$`)
    .replace(/\\\[(.+?)\\\]/gsu, (_match, content: string) => `$$${content}$$`)
    .replace(
      /^```(?:math|latex|katex)\s*\n([\s\S]*?)^```\s*$/gmu,
      (_match, content: string) => `$$\n${content.trim()}\n$$`
    );
}
