/**
 * Base abstract class for embedding providers.
 * All concrete providers must implement embedQuery, embedBatch, and getDimension.
 */
export class BaseEmbeddingProvider {
  /**
   * Embeds a single query or text string.
   * @param {string} text
   * @returns {Promise<number[]>} Float vector
   */
  async embedQuery(text) {
    throw new Error("embedQuery must be implemented by subclass");
  }

  /**
   * Embeds an array of text chunks.
   * @param {string[]} texts
   * @returns {Promise<number[][]>} Array of float vectors
   */
  async embedBatch(texts) {
    throw new Error("embedBatch must be implemented by subclass");
  }

  /**
   * Returns or dynamically detects the vector dimension size.
   * @returns {Promise<number>}
   */
  async getDimension() {
    throw new Error("getDimension must be implemented by subclass");
  }
}

export default BaseEmbeddingProvider;

