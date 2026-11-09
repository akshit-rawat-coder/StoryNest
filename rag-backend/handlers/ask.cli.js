#!/usr/bin/env node

import { getEnv } from "../config/env.js";
import { createEmbeddingProvider } from "../providers/index.js";
import { createQdrantClient } from "../vector/qdrant.client.js";
import { VectorStore } from "../vector/vector.store.js";
import { OpenRouterChatService } from "../services/chat.service.js";
import { RagQueryService } from "../services/rag.service.js";

async function runCli() {
  const args = process.argv.slice(2);
  const questionArg = args.join(" ").trim();

  const question =
    questionArg ||
    "How do we build a modern blogging platform with real-time features and state management?";

  console.log("==================================================");
  console.log("💬 Ask StoryNest :: Interactive RAG Query CLI");
  console.log("==================================================");
  console.log(`Question: "${question}"\n`);

  let env;
  try {
    env = getEnv();
  } catch (err) {
    console.error("Environment configuration error:", err.message);
    process.exit(1);
  }

  const embeddingProvider = createEmbeddingProvider(env);
  const qdrantClient = createQdrantClient({
    url: env.QDRANT_URL,
    apiKey: env.QDRANT_API_KEY,
  });

  const vectorStore = new VectorStore({
    client: qdrantClient,
    collectionName: env.QDRANT_COLLECTION_NAME,
  });

  const chatService = new OpenRouterChatService({
    apiKey: env.OPENROUTER_API_KEY,
    model: env.OPENROUTER_CHAT_MODEL,
    maxTokens: env.OPENROUTER_CHAT_MAX_TOKENS,
  });

  const ragService = new RagQueryService({
    embeddingProvider,
    vectorStore,
    chatService,
    similarityThreshold: env.SIMILARITY_THRESHOLD,
    topK: env.TOP_K_CHUNKS,
  });

  console.log("Searching Qdrant collection and synthesizing answer with OpenRouter...");
  const t0 = Date.now();
  const response = await ragService.ask({ question });
  const duration = Date.now() - t0;

  console.log("\n==================================================");
  console.log(`🤖 Answer (Generated in ${duration}ms):`);
  console.log("==================================================");
  console.log(response.answer);

  console.log("\n==================================================");
  console.log(`📚 Sources Cited (${response.sources.length}):`);
  console.log("==================================================");
  if (response.sources.length === 0) {
    console.log("None (No matching context met the similarity threshold)");
  } else {
    response.sources.forEach((src, idx) => {
      console.log(`[Source ${idx + 1}] "${src.title}" (/post/${src.slug})`);
      console.log(`  Category: ${src.category} | Chunks Used: ${src.relevantChunks.length}`);
      src.relevantChunks.forEach((c) => {
        console.log(`    • Chunk #${c.chunkIndex + 1}: ${c.text.slice(0, 100).replace(/\s+/g, " ")}...`);
      });
    });
  }

  console.log(`\nInsufficient Context Flag: ${response.insufficientContext}`);
  console.log("==================================================");
}

runCli().catch((err) => {
  console.error("Error executing RAG CLI:", err);
  process.exit(1);
});

