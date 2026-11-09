import { cleanHtml } from "./html.cleaner.js";
import { chunkArticle } from "./chunker.js";
import { generatePointId } from "../vector/vector.store.js";

/**
 * Full lifecycle processor for indexing, updating, or deleting an article in Qdrant.
 */
export class ArticleProcessor {
  /**
   * @param {Object} options
   * @param {import("../vector/vector.store.js").VectorStore} options.vectorStore
   * @param {import("../providers/base.embedding.js").BaseEmbeddingProvider} options.embeddingProvider
   * @param {Object} [options.chunkConfig]
   * @param {number} [options.minContentLength=0] - Minimum character threshold for indexing
   */
  constructor({
    vectorStore,
    embeddingProvider,
    chunkConfig = {},
    minContentLength = 0,
  }) {
    if (!vectorStore) throw new Error("ArticleProcessor: vectorStore is required");
    if (!embeddingProvider) throw new Error("ArticleProcessor: embeddingProvider is required");

    this.vectorStore = vectorStore;
    this.embeddingProvider = embeddingProvider;
    this.chunkConfig = chunkConfig;
    this.minContentLength = minContentLength;
  }

  /**
   * Processes an article for indexing, update, or deletion.
   * If status is not "active", any existing vectors for the article are deleted from Qdrant.
   *
   * @param {Object} article - Appwrite article document
   * @returns {Promise<Object>} Summary of action taken
   */
  async processArticle(article) {
    if (!article || !article.$id) {
      throw new Error("processArticle requires a valid article document with $id");
    }

    const articleId = article.$id;
    const isActive = article.status === "active";

    // Rule: Index only active published articles.
    // If article is inactive or draft, purge it from the vector store.
    if (!isActive) {
      await this.vectorStore.deleteByArticleId(articleId);
      return {
        action: "deleted",
        reason: "inactive_or_draft",
        articleId,
      };
    }

    // Clean HTML content
    const cleanText = cleanHtml(article.content || "");
    if (!cleanText) {
      // Empty content: remove from index if previously indexed
      await this.vectorStore.deleteByArticleId(articleId);
      return {
        action: "deleted",
        reason: "empty_content",
        articleId,
      };
    }

    // Filter out short stub/test articles based on minimum character length
    if (this.minContentLength > 0 && cleanText.length < this.minContentLength) {
      return {
        action: "skipped",
        reason: `below_min_length (${cleanText.length} < ${this.minContentLength} chars)`,
        articleId,
        title: article.title,
      };
    }

    // Generate overlapping chunks with context headers
    const chunks = chunkArticle({
      article,
      cleanText,
      chunkSize: this.chunkConfig.chunkSize || 1200,
      chunkOverlap: this.chunkConfig.chunkOverlap || 200,
    });

    if (chunks.length === 0) {
      await this.vectorStore.deleteByArticleId(articleId);
      return {
        action: "deleted",
        reason: "zero_chunks",
        articleId,
      };
    }

    // Generate embeddings in batch
    const textsToEmbed = chunks.map((c) => c.embeddedText);
    const vectors = await this.embeddingProvider.embedBatch(textsToEmbed);

    if (vectors.length !== chunks.length) {
      throw new Error(
        `Embedding vector count mismatch: expected ${chunks.length}, got ${vectors.length}`
      );
    }

    // Format tags
    const tagsArray = Array.isArray(article.tags)
      ? article.tags
      : (typeof article.tags === "string"
          ? article.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
          : []);

    // Build Qdrant points
    const points = chunks.map((chunk, idx) => ({
      id: generatePointId(articleId, chunk.chunkIndex),
      vector: vectors[idx],
      payload: {
        articleId,
        title: article.title || "Untitled",
        slug: article.slug || article.$id,
        category: article.category || "General",
        tags: tagsArray,
        authorUsername: article.authorUsername || "writer",
        status: article.status || "active",
        chunkIndex: chunk.chunkIndex,
        totalChunks: chunk.totalChunks,
        chunkText: chunk.chunkText,
        createdAt: article.$createdAt || new Date().toISOString(),
      },
    }));

    // Idempotent upsert: delete stale chunks before upserting new ones
    await this.vectorStore.deleteByArticleId(articleId);
    const upsertRes = await this.vectorStore.upsertPoints(points);

    return {
      action: "indexed",
      articleId,
      chunksCount: points.length,
      vectorsCount: points.length,
      title: article.title,
      qdrantResult: upsertRes,
    };
  }

  /**
   * Explicitly deletes an article from Qdrant by ID.
   * @param {string} articleId
   */
  async deleteArticle(articleId) {
    if (!articleId) {
      throw new Error("deleteArticle: articleId is required");
    }
    await this.vectorStore.deleteByArticleId(articleId);
    return {
      action: "deleted",
      articleId,
    };
  }
}

export default ArticleProcessor;
