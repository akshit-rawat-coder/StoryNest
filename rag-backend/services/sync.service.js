import { Client, Databases } from "node-appwrite";

/**
 * Service to handle automated article indexing triggers from Appwrite webhooks or API requests.
 */
export class SyncService {
  /**
   * @param {Object} options
   * @param {import("../pipeline/article.processor.js").ArticleProcessor} options.processor
   * @param {Object} options.env
   * @param {Databases} [options.databases]
   */
  constructor({ processor, env, databases }) {
    if (!processor) throw new Error("SyncService: processor is required");
    if (!env) throw new Error("SyncService: env is required");

    this.processor = processor;
    this.env = env;
    this.inFlightSyncs = new Map();

    if (databases) {
      this.databases = databases;
    } else {
      const appwriteClient = new Client();
      appwriteClient
        .setEndpoint(env.APPWRITE_ENDPOINT)
        .setProject(env.APPWRITE_PROJECT_ID)
        .setKey(env.APPWRITE_API_KEY);
      this.databases = new Databases(appwriteClient);
    }
  }

  /**
   * Verifies the webhook signature or secret header/query parameter.
   * @param {Object} headers
   * @param {string} [querySecret]
   * @returns {boolean}
   */
  verifyWebhookAuth(headers = {}, querySecret = "") {
    const configuredSecret = this.env.WEBHOOK_SECRET;
    if (!configuredSecret) {
      return true; // No secret configured
    }

    const authHeader =
      headers["x-webhook-secret"] ||
      headers["x-appwrite-webhook-signature"] ||
      headers["authorization"]?.replace(/^Bearer\s+/i, "") ||
      "";

    const providedSecret = authHeader || querySecret;
    return providedSecret === configuredSecret;
  }

  /**
   * Handles an incoming Appwrite webhook event payload.
   * @param {Object} options
   * @param {string} options.event - Appwrite event string (e.g. databases.*.collections.articles.documents.*.create)
   * @param {Object} options.payload - Document payload
   * @returns {Promise<Object>}
   */
  async handleWebhookEvent({ event = "", payload = {} }) {
    if (!payload || !payload.$id) {
      throw new Error("Invalid webhook payload: document $id is required");
    }

    const articleId = payload.$id;
    const isDelete = event.endsWith(".delete") || event.includes(".delete.");

    if (isDelete) {
      console.log(`SyncService :: Webhook event delete for article: ${articleId}`);
      return this.processor.deleteArticle(articleId);
    }

    // Upsert or status change (active/inactive)
    console.log(`SyncService :: Webhook event update/create for article: ${articleId}`);
    return this.queueArticleProcessing(payload);
  }

  /**
   * Synchronizes a single article by ID, fetching fresh data from Appwrite.
   * @param {string} articleId
   * @param {"upsert"|"delete"} [action="upsert"]
   * @returns {Promise<Object>}
   */
  async syncSingleArticle(articleId, action = "upsert") {
    if (!articleId) {
      throw new Error("syncSingleArticle: articleId is required");
    }

    if (action === "delete") {
      console.log(`SyncService :: Deleting article vectors for ${articleId}`);
      return this.processor.deleteArticle(articleId);
    }

    console.log(`SyncService :: Fetching article ${articleId} from Appwrite...`);
    try {
      const doc = await this.databases.getDocument(
        this.env.APPWRITE_DATABASE_ID,
        this.env.APPWRITE_COLLECTION_ID,
        articleId
      );

      return this.queueArticleProcessing(doc);
    } catch (err) {
      // If document was not found (404), purge from vector database
      if (err.code === 404 || err.message?.includes("could not be found")) {
        console.log(`SyncService :: Article ${articleId} not found in Appwrite. Purging from Qdrant.`);
        return this.processor.deleteArticle(articleId);
      }
      throw err;
    }
  }

  /**
   * Concurrency-safe queue to prevent simultaneous duplicate indexing of the same article.
   * @param {Object} doc
   * @returns {Promise<Object>}
   */
  async queueArticleProcessing(doc) {
    const articleId = doc.$id;

    if (this.inFlightSyncs.has(articleId)) {
      console.log(`SyncService :: Article ${articleId} already indexing. Awaiting in-flight sync.`);
      await this.inFlightSyncs.get(articleId);
    }

    const syncPromise = this.processor
      .processArticle(doc)
      .finally(() => {
        this.inFlightSyncs.delete(articleId);
      });

    this.inFlightSyncs.set(articleId, syncPromise);
    return syncPromise;
  }
}

export default SyncService;

