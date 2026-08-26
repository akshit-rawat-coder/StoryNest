/**
 * Estimate the reading time for HTML content.
 *
 * Strips all HTML tags, counts the remaining words, and divides by an
 * average reading speed of 200 words per minute.  Returns at minimum 1.
 *
 * @param {string | null | undefined} htmlContent – raw HTML from the editor
 * @returns {number} estimated minutes (always ≥ 1)
 */
export function calculateReadingTime(htmlContent) {
  if (!htmlContent || typeof htmlContent !== "string") return 1;

  const plainText = htmlContent
    .replace(/<[^>]*>/g, " ")   // strip tags
    .replace(/&nbsp;/g, " ")    // common HTML entity
    .replace(/&[a-z]+;/gi, " ") // catch remaining entities
    .trim();

  if (!plainText) return 1;

  const wordCount = plainText.split(/\s+/).filter(Boolean).length;

  return Math.max(1, Math.ceil(wordCount / 200));
}
