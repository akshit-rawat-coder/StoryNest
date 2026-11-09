import { QdrantClient } from "@qdrant/js-client-rest";

/**
 * Creates and configures a QdrantClient instance.
 * @param {Object} options
 * @param {string} options.url
 * @param {string} options.apiKey
 * @returns {QdrantClient}
 */
export function createQdrantClient({ url, apiKey }) {
  if (!url) {
    throw new Error("createQdrantClient: url is required");
  }

  return new QdrantClient({
    url,
    apiKey,
    checkCompatibility: false,
  });
}

export default createQdrantClient;

