import OpenRouterEmbeddingProvider from "./openrouter.embedding.js";

/**
 * Creates and returns the configured embedding provider.
 * @param {Object} env
 * @returns {OpenRouterEmbeddingProvider}
 */
export function createEmbeddingProvider(env) {
  return new OpenRouterEmbeddingProvider({
    apiKey: env.OPENROUTER_API_KEY,
    model: env.OPENROUTER_EMBEDDING_MODEL,
    baseUrl: env.OPENROUTER_BASE_URL,
  });
}

export { BaseEmbeddingProvider } from "./base.embedding.js";
export { OpenRouterEmbeddingProvider } from "./openrouter.embedding.js";
export default createEmbeddingProvider;

