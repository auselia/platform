export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// For values that go into an email subject or header: no line breaks.
export function singleLine(s: string): string {
  return s.replace(/[\r\n\u2028\u2029]+/g, " ").trim();
}
