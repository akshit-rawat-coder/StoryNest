/**
 * Splits plain text into overlapping chunks while respecting sentence/paragraph boundaries.
 *
 * @param {string} text - Cleaned plain text
 * @param {Object} [options]
 * @param {number} [options.chunkSize=1200] - Max characters per chunk (~300 tokens)
 * @param {number} [options.chunkOverlap=200] - Overlap between adjacent chunks
 * @returns {string[]} Array of chunk text strings
 */
export function splitTextIntoChunks(text, { chunkSize = 1200, chunkOverlap = 200 } = {}) {
  if (!text || typeof text !== "string") {
    return [];
  }

  const trimmed = text.trim();
  if (trimmed.length <= chunkSize) {
    return [trimmed];
  }

  const chunks = [];
  let startIndex = 0;

  while (startIndex < trimmed.length) {
    let endIndex = startIndex + chunkSize;

    if (endIndex >= trimmed.length) {
      chunks.push(trimmed.slice(startIndex).trim());
      break;
    }

    // Attempt to break at the natural boundaries: paragraph, newline, period, question mark, or space
    const windowSlice = trimmed.slice(startIndex, endIndex);
    let splitPoint = -1;

    const naturalDelimiters = ["\n\n", "\n", ". ", "? ", "! ", " "];
    for (const delimiter of naturalDelimiters) {
      const lastIndex = windowSlice.lastIndexOf(delimiter);
      // Require the delimiter to be reasonably far into the chunk (at least 60% of chunkSize)
      if (lastIndex > chunkSize * 0.6) {
        splitPoint = lastIndex + delimiter.length;
        break;
      }
    }

    // Fallback: if no good split point found, split at exact chunkSize
    if (splitPoint === -1) {
      splitPoint = chunkSize;
    }

    const chunkContent = trimmed.slice(startIndex, startIndex + splitPoint).trim();
    if (chunkContent.length > 0) {
      chunks.push(chunkContent);
    }

    // Step forward, leaving chunkOverlap characters
    startIndex = startIndex + splitPoint - chunkOverlap;
    if (startIndex < 0) startIndex = 0;
  }

  return chunks;
}

/**
 * Prepares article chunks with metadata context headers for enhanced semantic embedding.
 *
 * @param {Object} params
 * @param {Object} params.article - Appwrite article document
 * @param {string} params.cleanText - Plain text from cleanHtml
 * @param {number} [params.chunkSize=1200]
 * @param {number} [params.chunkOverlap=200]
 * @returns {Array<{ chunkIndex: number, totalChunks: number, chunkText: string, embeddedText: string }>}
 */
export function chunkArticle({
  article,
  cleanText,
  chunkSize = 1200,
  chunkOverlap = 200,
}) {
  const rawChunks = splitTextIntoChunks(cleanText, { chunkSize, chunkOverlap });
  const totalChunks = rawChunks.length;

  const title = article.title || "Untitled";
  const category = article.category || "General";
  const tagsList = Array.isArray(article.tags)
    ? article.tags.join(", ")
    : (typeof article.tags === "string" ? article.tags : "");

  return rawChunks.map((chunkText, chunkIndex) => {
    // Inject contextual grounding header into the text passed to the embedding model
    const header = [
      `Article: ${title}`,
      `Category: ${category}`,
      tagsList ? `Tags: ${tagsList}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    const embeddedText = `${header}\n\n${chunkText}`;

    return {
      chunkIndex,
      totalChunks,
      chunkText,
      embeddedText,
    };
  });
}

export default {
  splitTextIntoChunks,
  chunkArticle,
};

