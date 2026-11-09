import conf from "../conf/conf";

/**
 * Client service to communicate with the Ask StoryNest RAG backend API.
 */
class RagService {
  constructor() {
    this.baseUrl = conf.ragApiUrl
      ? conf.ragApiUrl.replace(/\/+$/, "")
      : "http://localhost:3001";
  }

  /**
   * Queries the Ask StoryNest RAG backend.
   *
   * @param {string} question - User inquiry.
   * @param {Object} [options]
   * @param {"all"|"article"} [options.mode="all"] - Search scope mode.
   * @param {string|null} [options.contextArticleId=null] - Appwrite article document ID when mode is "article".
   * @returns {Promise<{
   *   answer: string,
   *   sources: Array<{
   *     articleId: string,
   *     title: string,
   *     slug: string,
   *     category: string,
   *     relevantChunks: Array<{ chunkIndex: number, text: string }>
   *   }>,
   *   insufficientContext: boolean,
   *   mode: "all"|"article",
   *   contextArticleId: string|null
   * }>}
   */
  async askQuestion(question, { mode = "all", contextArticleId = null } = {}) {
    const trimmed = (question || "").trim();
    if (!trimmed) {
      throw new Error("Please enter a question to ask StoryNest.");
    }

    if (mode === "article" && !contextArticleId) {
      throw new Error("An article must be selected when asking in 'This Article' mode.");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      const payload = {
        question: trimmed,
        mode,
        ...(mode === "article" && contextArticleId ? { contextArticleId } : {}),
      };

      const response = await fetch(`${this.baseUrl}/api/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("You're asking questions too quickly. Please wait a moment before trying again.");
        }

        let errorMessage = `Server error (${response.status})`;
        try {
          const errorJson = await response.json();
          if (errorJson.message) {
            errorMessage = errorJson.message;
          } else if (errorJson.error) {
            errorMessage = errorJson.error;
          }
        } catch {
          // Fallback to default
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      return {
        answer: data.answer || "No response received.",
        sources: Array.isArray(data.sources) ? data.sources : [],
        insufficientContext: Boolean(data.insufficientContext),
        mode: data.mode || mode,
        contextArticleId: data.contextArticleId || (mode === "article" ? contextArticleId : null),
      };
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("The request timed out. Please try again with a shorter question.");
      }

      // Check for connection refused / offline server
      if (
        error.message?.includes("Failed to fetch") ||
        error.message?.includes("NetworkError") ||
        error.message?.includes("connection refused")
      ) {
        throw new Error(
          "Ask StoryNest is currently offline. Please ensure the backend server is running on port 3001."
        );
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Health check probe for the RAG API.
   * @returns {Promise<{ status: string, service?: string, model?: string }|null>}
   */
  async checkHealth() {
    try {
      const response = await fetch(`${this.baseUrl}/api/health`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Best-effort notification when an article changes in the client.
   * NOTE: Authoritative automatic vector synchronization in production is
   * performed server-to-server via Appwrite Webhooks (/api/webhooks/appwrite)
   * using WEBHOOK_SECRET. Client-side code never sends or exposes the secret.
   *
   * @param {string} articleId - Appwrite document ID
   * @param {"upsert"|"delete"} [action="upsert"]
   * @returns {Promise<void>}
   */
  async notifyArticleChange(articleId, action = "upsert") {
    if (!articleId) return;

    try {
      // Fire-and-forget notification to the single sync endpoint without exposing secrets.
      await fetch(`${this.baseUrl}/api/articles/sync-single`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ articleId, action }),
      }).catch(() => {});
    } catch {
      // Non-blocking catch to ensure article editing/deletion is never interrupted
    }
  }
}

export const ragService = new RagService();
export default ragService;

