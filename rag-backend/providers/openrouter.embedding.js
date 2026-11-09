import BaseEmbeddingProvider from "./base.embedding.js";

export class OpenRouterEmbeddingProvider extends BaseEmbeddingProvider {
  /**
   * @param {Object} options
   * @param {string} options.apiKey
   * @param {string} [options.model]
   * @param {string} [options.baseUrl]
   * @param {Function} [options.fetchFn] - Custom fetch for testing/mocking
   */
  constructor({
    apiKey,
    model = "openai/text-embedding-3-small",
    baseUrl = "https://openrouter.ai/api/v1",
    fetchFn = globalThis.fetch,
  }) {
    super();
    if (!apiKey) {
      throw new Error("OpenRouterEmbeddingProvider: apiKey is required.");
    }
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.fetchFn = fetchFn;
    this._dimension = null;
  }

  /**
   * Generates embedding for a single text string.
   * @param {string} text
   * @returns {Promise<number[]>}
   */
  async embedQuery(text) {
    if (!text || typeof text !== "string") {
      throw new Error("embedQuery requires a non-empty string input");
    }
    const [vector] = await this.embedBatch([text]);
    return vector;
  }

  /**
   * Generates embeddings for an array of text strings.
   * Automatically handles batching (up to 64 items per call).
   * @param {string[]} texts
   * @returns {Promise<number[][]>}
   */
  async embedBatch(texts) {
    if (!Array.isArray(texts) || texts.length === 0) {
      return [];
    }

    const batchSize = 64;
    const allVectors = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const slice = texts.slice(i, i + batchSize);
      const vectors = await this._callEmbeddingApi(slice);
      allVectors.push(...vectors);
    }

    if (!this._dimension && allVectors.length > 0) {
      this._dimension = allVectors[0].length;
    }

    return allVectors;
  }

  /**
   * Calls the OpenRouter /embeddings endpoint with retries for rate limits.
   * @private
   */
  async _callEmbeddingApi(inputs, attempt = 1) {
    const url = `${this.baseUrl}/embeddings`;
    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://storynest.app",
        "X-Title": "StoryNest RAG",
      },
      body: JSON.stringify({
        model: this.model,
        input: inputs,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 429 && attempt < 3) {
        const delay = attempt * 1500;
        await new Promise((r) => setTimeout(r, delay));
        return this._callEmbeddingApi(inputs, attempt + 1);
      }
      throw new Error(
        `OpenRouter Embedding API failed with status ${response.status}: ${errorText}`
      );
    }

    const json = await response.json();
    if (!json?.data || !Array.isArray(json.data)) {
      throw new Error("Invalid response format from OpenRouter embeddings API");
    }

    // Sort by index to maintain original order
    const sorted = [...json.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return sorted.map((item) => item.embedding);
  }

  /**
   * Dynamically probes the model to detect and verify vector dimension.
   * @returns {Promise<number>}
   */
  async detectDimension() {
    const probeVector = await this.embedQuery("StoryNest embedding probe");
    if (!probeVector || !Array.isArray(probeVector) || probeVector.length === 0) {
      throw new Error("Failed to detect embedding dimensions from provider");
    }
    this._dimension = probeVector.length;
    return this._dimension;
  }

  /**
   * Returns cached dimension or detects it via probe.
   * @returns {Promise<number>}
   */
  async getDimension() {
    if (this._dimension) return this._dimension;
    return this.detectDimension();
  }
}

export default OpenRouterEmbeddingProvider;

