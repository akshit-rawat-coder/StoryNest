import { z } from "zod";

export const QuestionInputSchema = z.object({
  question: z
    .string()
    .trim()
    .min(3, "Question must be at least 3 characters long")
    .max(1000, "Question cannot exceed 1000 characters"),
  mode: z.enum(["all", "article"]).default("all"),
  contextArticleId: z.string().trim().min(1).optional().nullable(),
  similarityThreshold: z.number().min(0).max(1).optional(),
  topK: z.number().int().positive().max(20).optional(),
});

/**
 * Core RAG Orchestrator Service for Ask StoryNest.
 */
export class RagQueryService {
  /**
   * @param {Object} options
   * @param {import("../providers/base.embedding.js").BaseEmbeddingProvider} options.embeddingProvider
   * @param {import("../vector/vector.store.js").VectorStore} options.vectorStore
   * @param {import("./chat.service.js").OpenRouterChatService} options.chatService
   * @param {number} [options.similarityThreshold=0.35]
   * @param {number} [options.topK=5]
   */
  constructor({
    embeddingProvider,
    vectorStore,
    chatService,
    similarityThreshold = 0.35,
    topK = 5,
  }) {
    if (!embeddingProvider) throw new Error("RagQueryService: embeddingProvider is required");
    if (!vectorStore) throw new Error("RagQueryService: vectorStore is required");
    if (!chatService) throw new Error("RagQueryService: chatService is required");

    this.embeddingProvider = embeddingProvider;
    this.vectorStore = vectorStore;
    this.chatService = chatService;
    this.defaultSimilarityThreshold = similarityThreshold;
    this.defaultTopK = topK;
  }

  /**
   * Executes the full RAG pipeline for a user question.
   *
   * @param {Object} input
   * @param {string} input.question
   * @param {"all"|"article"} [input.mode="all"]
   * @param {string|null} [input.contextArticleId]
   * @param {number} [input.similarityThreshold]
   * @param {number} [input.topK]
   * @returns {Promise<{
   *   answer: string,
   *   sources: Array<{
   *     articleId: string,
   *     title: string,
   *     slug: string,
   *     category: string,
   *     relevantChunks: Array<{ chunkIndex: number, text: string }>
   *   }>,
   *   insufficientContext: boolean
   * }>}
   */
  async ask(input) {
    // 1. Validate input
    const parsed = QuestionInputSchema.parse(input);
    const question = parsed.question;
    const isArticleMode = parsed.mode === "article";
    const contextArticleId = parsed.contextArticleId?.trim();

    if (isArticleMode && !contextArticleId) {
      const err = new Error("contextArticleId is required when mode is 'article'");
      err.name = "ValidationError";
      throw err;
    }

    const threshold = parsed.similarityThreshold ?? this.defaultSimilarityThreshold;
    const limit = parsed.topK ?? this.defaultTopK;

    // 2. Generate embedding for user query
    const queryVector = await this.embeddingProvider.embedQuery(question);

    // 3. Search Qdrant vector database (enforcing status="active" and optional articleId scoping)
    const searchHits = await this.vectorStore.search({
      vector: queryVector,
      limit,
      articleId: isArticleMode ? contextArticleId : undefined,
    });

    // 4. Apply configurable minimum similarity threshold
    const relevantHits = searchHits.filter((hit) => {
      const passes = typeof hit.score === "number" && hit.score >= threshold;
      return passes;
    });

    // 5. Short-circuit if no relevant context passed the threshold
    if (relevantHits.length === 0) {
      return {
        answer: isArticleMode
          ? "This article does not contain enough information to answer your question. Try asking about the broader platform or switch to 'All Articles'."
          : "Based on the available StoryNest articles, there is not enough information to answer this question.",
        sources: [],
        insufficientContext: true,
        mode: isArticleMode ? "article" : "all",
        contextArticleId: isArticleMode ? contextArticleId : null,
      };
    }

    // 6. Deduplicate & group chunks by article
    const articleMap = new Map();
    const flatChunksForChat = [];

    for (const hit of relevantHits) {
      const payload = hit.payload || {};
      const articleId = payload.articleId || "unknown";

      if (!articleMap.has(articleId)) {
        articleMap.set(articleId, {
          articleId,
          title: payload.title || "Untitled",
          slug: payload.slug || articleId,
          category: payload.category || "General",
          relevantChunks: [],
        });
      }

      const articleEntry = articleMap.get(articleId);

      // Check if chunkIndex is already added to avoid duplication
      const alreadyHasChunk = articleEntry.relevantChunks.some(
        (c) => c.chunkIndex === payload.chunkIndex
      );

      if (!alreadyHasChunk) {
        articleEntry.relevantChunks.push({
          chunkIndex: payload.chunkIndex ?? 0,
          text: payload.chunkText || "",
        });

        flatChunksForChat.push({
          articleId,
          title: payload.title || "Untitled",
          category: payload.category || "General",
          chunkText: payload.chunkText || "",
        });
      }
    }

    // Sort chunks within each article by chunkIndex
    for (const article of articleMap.values()) {
      article.relevantChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
    }

    const sources = Array.from(articleMap.values());

    // 7. Synthesize answer via OpenRouter Chat Completions
    const firstArticleTitle = sources[0]?.title || "";
    const chatResult = await this.chatService.generateAnswer({
      question,
      chunks: flatChunksForChat,
      mode: isArticleMode ? "article" : "all",
      articleTitle: firstArticleTitle,
    });

    return {
      answer: chatResult.answer,
      sources,
      insufficientContext: chatResult.insufficientContext,
      mode: isArticleMode ? "article" : "all",
      contextArticleId: isArticleMode ? contextArticleId : null,
    };
  }
}

export default RagQueryService;
