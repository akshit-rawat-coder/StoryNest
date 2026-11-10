import { createRequestHandler } from "./server.js";

export { getEnv, envSchema } from "./config/env.js";
export {
  BaseEmbeddingProvider,
  OpenRouterEmbeddingProvider,
  createEmbeddingProvider,
} from "./providers/index.js";
export { createQdrantClient } from "./vector/qdrant.client.js";
export { CollectionManager } from "./vector/collection.manager.js";
export { VectorStore, generatePointId } from "./vector/vector.store.js";
export { cleanHtml } from "./pipeline/html.cleaner.js";
export { splitTextIntoChunks, chunkArticle } from "./pipeline/chunker.js";
export { ArticleProcessor } from "./pipeline/article.processor.js";
export { OpenRouterChatService } from "./services/chat.service.js";
export { RagQueryService, QuestionInputSchema } from "./services/rag.service.js";
export { SyncService } from "./services/sync.service.js";
export { createServer, createRequestHandler } from "./server.js";

// Disable automatic JSON body parsing so raw HTTP body bytes are preserved for HMAC signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

// Cached serverless handler across warm invocations
let cachedHandler = null;

/**
 * Default export handler for Vercel Serverless Function runtime.
 * Handles:
 * - GET /api/health (and /)
 * - POST /api/ask
 * - POST /api/webhooks/appwrite
 * - POST /api/articles/sync-single
 */
export default async function handler(req, res) {
  try {
    if (!cachedHandler) {
      cachedHandler = createRequestHandler();
    }
    return await cachedHandler(req, res);
  } catch (err) {
    console.error("Vercel Serverless Function Error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "Internal Server Error",
        message: err.message || "Failed to process request",
      })
    );
  }
}
