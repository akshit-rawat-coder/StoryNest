/**
 * Converts TinyMCE HTML strings into clean, normalized plain text for embedding and RAG.
 * Preserves structural paragraph breaks and decodes common HTML entities.
 * @param {string} html
 * @returns {string} Clean plain text
 */
export function cleanHtml(html) {
  if (!html || typeof html !== "string") {
    return "";
  }

  let text = html;

  // Replace block tags with double newlines
  text = text.replace(/<\/(p|div|h[1-6]|li|blockquote|tr)>/gi, "\n\n");
  text = text.replace(/<br\s*[\/]?>/gi, "\n");
  text = text.replace(/<hr\s*[\/]?>/gi, "\n\n");

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

  // Normalize horizontal whitespace (spaces and tabs)
  text = text.replace(/[ \t]+/g, " ");

  // Collapse 3+ newlines to double newlines
  text = text.replace(/\n\s*\n\s*\n+/g, "\n\n");

  return text.trim();
}

export default cleanHtml;

