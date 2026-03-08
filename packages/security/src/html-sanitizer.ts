const SCRIPT_TAG_PATTERN = /<script\b[\s\S]*?>[\s\S]*?<\/script>/giu;
const EVENT_HANDLER_PATTERN = /\son[a-z]+\s*=\s*(['"]).*?\1/giu;

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function sanitizeHtmlFragment(value: string): string {
  return value.replace(SCRIPT_TAG_PATTERN, "").replace(EVENT_HANDLER_PATTERN, "");
}
