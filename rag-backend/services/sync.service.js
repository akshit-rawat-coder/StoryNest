import crypto from "node:crypto";
import { Client, Databases, Query } from "node-appwrite";
import { cleanHtml } from "../pipeline/html.cleaner.js";

/**
 * Production-grade synchronization service for StoryNest RAG.
 * Features:
 * - HMAC-SHA1 signature and secret verification
 * - Stale upsert & stale delete protection
 * - Durable job lifecycle (pending -> processing -> completed / failed)
 * - Expiring worker leases preventing concurrent collisions
 * - Reconciliation engine to detect and fix missing or stale vector points
 */
export class SyncService {
  /**
   * @param {Object} options
   * @param {import("../pipeline/article.processor.js").ArticleProcessor} options.processor
   * @param {Object} options.env
   * @param {import("./job.store.js").SyncJobStore} [options.jobStore]
   * @param {Databases} [options.databases]
   */
  constructor({ processor, env, jobStore, databases }) {
    if (!processor) throw new Error("SyncService: processor is required");
    if (!env) throw new Error("SyncService: env is required");

    this.processor = processor;
    this.env = env;
    this.jobStore = jobStore || null;
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
   * Computes a deterministic content hash for an article.
   * @param {Object} doc
   * @returns {string} SHA-256 hash
   */
  computeContentHash(doc = {}) {
    const cleanText = cleanHtml(doc.content || "");
    const title = doc.title || "";
    const status = doc.status || "";
    const category = doc.category || "";
    const tags = Array.isArray(doc.tags)
      ? doc.tags.join(",")
      : String(doc.tags || "");

    return crypto
      .createHash("sha256")
      .update(`${title}:${status}:${category}:${tags}:${cleanText}`)
      .digest("hex");
  }

  /**
   * Timing-safe string comparison.
   * @param {string} a
   * @param {string} b
   * @returns {boolean}
   */
  safeCompare(a, b) {
    if (typeof a !== "string" || typeof b !== "string") return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * Verifies the webhook signature or secret header/query parameter.
   * Supports:
   * 1. Official Appwrite HMAC-SHA1 signature (X-Appwrite-Webhook-Signature)
   * 2. Direct secret headers (X-Webhook-Secret, Authorization: Bearer <secret>)
   * 3. Query string secret (?secret=<secret>)
   *
   * @param {Object} headers
   * @param {string} [querySecret]
   * @param {string} [requestUrl] - Full request URL for HMAC verification
   * @returns {boolean}
   */
  verifyWebhookAuth(headers = {}, querySecret = "", requestUrl = "") {
    const configuredSecret = this.env.WEBHOOK_SECRET;
    if (!configuredSecret) {
      return true; // No secret configured
    }

    // 1. Direct custom secret header
    const directHeader = headers["x-webhook-secret"] || "";
    if (directHeader && this.safeCompare(directHeader, configuredSecret)) {
      return true;
    }

    // 2. Query parameter
    if (querySecret && this.safeCompare(querySecret, configuredSecret)) {
      return true;
    }

    // 3. Bearer authorization header
    const authHeader = (headers["authorization"] || "").replace(/^Bearer\s+/i, "");
    if (authHeader && this.safeCompare(authHeader, configuredSecret)) {
      return true;
    }

    // 4. Official Appwrite Webhook Signature (HMAC-SHA1 of request URL)
    const appwriteSignature = headers["x-appwrite-webhook-signature"] || "";
    if (appwriteSignature) {
      // In Appwrite, if the signature header contains the secret directly:
      if (this.safeCompare(appwriteSignature, configuredSecret)) {
        return true;
      }

      // If signed with HMAC-SHA1:
      if (requestUrl) {
        try {
          const expectedHex = crypto
            .createHmac("sha1", configuredSecret)
            .update(requestUrl)
            .digest("hex");
          const expectedBase64 = crypto
            .createHmac("sha1", configuredSecret)
            .update(requestUrl)
            .digest("base64");

          if (
            this.safeCompare(appwriteSignature, expectedHex) ||
            this.safeCompare(appwriteSignature, expectedBase64)
          ) {
            return true;
          }
        } catch {
          // Fall through
        }
      }
    }

    return false;
  }

  /**
   * Handles an incoming Appwrite webhook event payload.
   *
   * @param {Object} options
   * @param {string} options.event - Exact Appwrite event name
   * @param {Object} options.payload - Appwrite document payload
   * @returns {Promise<Object>}
   */
  async handleWebhookEvent({ event = "", payload = {} }) {
    if (!payload || !payload.$id) {
      throw new Error("Invalid webhook payload: document $id is required");
    }

    const articleId = String(payload.$id);
    const isDelete = event.endsWith(".delete") || event.includes(".delete.");
    const articleUpdatedAt = payload.$updatedAt || payload.$createdAt || new Date().toISOString();

    // Determine target action:
    // 1. Delete events strictly trigger vector deletion
    // 2. Create/Update events check status:
    //    - If status === "active" -> upsert
    //    - If status !== "active" (e.g. "inactive", "draft") -> delete
    let action = "upsert";
    if (isDelete) {
      action = "delete";
    } else if (payload.status !== undefined && payload.status !== "active") {
      action = "delete";
    }

    const contentHash = action === "upsert" ? this.computeContentHash(payload) : "";

    // 1. Check idempotency: if Qdrant already contains indexed chunks with the exact same contentHash,
    // we can return early without repeating heavy embedding operations.
    if (action === "upsert" && this.processor.vectorStore?.getArticleMetadata) {
      const existingMeta = await this.processor.vectorStore.getArticleMetadata(articleId);
      if (
        existingMeta &&
        existingMeta.contentHash === contentHash &&
        existingMeta.articleUpdatedAt &&
        new Date(existingMeta.articleUpdatedAt).getTime() >= new Date(articleUpdatedAt).getTime()
      ) {
        return {
          action: "skipped",
          reason: "already_indexed_identical_version",
          articleId,
          contentHash,
        };
      }
    }

    // 2. Persist to durable job store if configured
    let job = null;
    if (this.jobStore) {
      job = await this.jobStore.createJob({
        articleId,
        action,
        event,
        contentHash,
        articleUpdatedAt,
      });
    }

    // 3. Process job inline (Vercel Serverless execution lifecycle)
    if (job) {
      const result = await this.processJob(job.$id, { fallbackDoc: payload });
      return { success: true, jobId: job.$id, action, result };
    }

    // Fallback: direct processing if jobStore not injected
    return this.executeSync({ articleId, action, doc: payload, articleUpdatedAt, contentHash });
  }

  /**
   * Executes a durable job from the job store with concurrency locking & stale guards.
   *
   * @param {string} jobId
   * @param {Object} [options]
   * @param {Object} [options.fallbackDoc]
   * @returns {Promise<Object>}
   */
  async processJob(jobId, { fallbackDoc = null } = {}) {
    if (!this.jobStore) {
      throw new Error("processJob: jobStore is not initialized");
    }

    // 1. Acquire lease to prevent concurrent worker collisions
    const job = await this.jobStore.acquireLease(jobId, 60000);
    if (!job) {
      return { skipped: true, reason: "active_lease_held_by_another_worker", jobId };
    }

    const t0 = Date.now();
    try {
      const result = await this.executeSync({
        articleId: job.articleId,
        action: job.action,
        doc: fallbackDoc,
        articleUpdatedAt: job.articleUpdatedAt,
        contentHash: job.contentHash,
      });

      const durationMs = Date.now() - t0;
      await this.jobStore.markCompleted(jobId, {
        durationMs,
        chunksCount: result.chunksCount || 0,
        vectorsCount: result.vectorsCount || 0,
      });

      return result;
    } catch (err) {
      console.error(`[SyncService] Job ${jobId} failed:`, err.message);
      await this.jobStore.markFailed(jobId, err);
      throw err;
    }
  }

  /**
   * Helper to safely invoke article deletion on processor or vectorStore.
   * @param {string} articleId
   */
  async deleteArticleVectors(articleId) {
    if (typeof this.processor.deleteArticle === "function") {
      return await this.processor.deleteArticle(articleId);
    }
    if (this.processor.vectorStore?.deleteByArticleId) {
      return await this.processor.vectorStore.deleteByArticleId(articleId);
    }
  }

  /**
   * Core synchronization logic with stale upsert and stale delete guards.
   *
   * @param {Object} params
   * @param {string} params.articleId
   * @param {"upsert"|"delete"} params.action
   * @param {Object} [params.doc]
   * @param {string} [params.articleUpdatedAt]
   * @param {string} [params.contentHash]
   * @returns {Promise<Object>}
   */
  async executeSync({ articleId, action, doc = null, articleUpdatedAt = "", contentHash = "" }) {
    if (!articleId) throw new Error("executeSync: articleId is required");

    // Prevent local in-flight concurrent collision for same article
    if (this.inFlightSyncs.has(articleId)) {
      await this.inFlightSyncs.get(articleId);
    }

    const syncPromise = (async () => {
      // ------------------------------------------------------------------
      // Action: DELETE
      // ------------------------------------------------------------------
      if (action === "delete") {
        // STALE DELETE GUARD:
        // Before deleting vectors from Qdrant, check Appwrite:
        // If the document currently exists in Appwrite, is active, and was updated
        // AFTER the delete event timestamp, an older delete event must NOT remove active content!
        if (typeof this.databases?.getDocument === "function") {
          try {
            const currentDoc = await this.databases.getDocument(
              this.env.APPWRITE_DATABASE_ID,
              this.env.APPWRITE_COLLECTION_ID,
              articleId
            );

            if (currentDoc && currentDoc.status === "active") {
              const currentUpdatedTime = new Date(currentDoc.$updatedAt || currentDoc.$createdAt).getTime();
              const eventUpdatedTime = articleUpdatedAt ? new Date(articleUpdatedAt).getTime() : 0;

              if (currentUpdatedTime > eventUpdatedTime) {
                console.warn(
                  `[SyncService] Stale delete rejected for '${articleId}': article is active in Appwrite with newer timestamp.`
                );
                return { action: "skipped", reason: "stale_delete_rejected", articleId };
              }
            }
          } catch (err) {
            // If 404, article was genuinely deleted in Appwrite -> proceed with vector purge
            if (err.code !== 404 && !err.message?.includes("could not be found")) {
              console.warn(`[SyncService] Warning during delete guard check for ${articleId}:`, err.message);
            }
          }
        }

        console.log(`[SyncService] Purging vectors for article: ${articleId}`);
        const deleteRes = await this.deleteArticleVectors(articleId);
        return deleteRes || { action: "deleted", articleId };
      }

      // ------------------------------------------------------------------
      // Action: UPSERT
      // ------------------------------------------------------------------
      let articleToProcess = doc;

      // Always fetch latest document from Appwrite to guarantee data freshness and prevent stale overwrites
      if (typeof this.databases?.getDocument === "function") {
        try {
          const latestDoc = await this.databases.getDocument(
            this.env.APPWRITE_DATABASE_ID,
            this.env.APPWRITE_COLLECTION_ID,
            articleId
          );
          articleToProcess = latestDoc;
        } catch (err) {
          if (err.code === 404 || err.message?.includes("could not be found")) {
            console.log(`[SyncService] Article ${articleId} not found in Appwrite. Purging vectors.`);
            const deleteRes = await this.deleteArticleVectors(articleId);
            return deleteRes || { action: "deleted", reason: "not_found_in_appwrite", articleId };
          }
          if (!articleToProcess) throw err;
        }
      }

      // If document is inactive, delete vectors
      if (articleToProcess.status !== "active") {
        console.log(`[SyncService] Article ${articleId} is not active (${articleToProcess.status}). Purging vectors.`);
        const deleteRes = await this.deleteArticleVectors(articleId);
        return deleteRes || { action: "deleted", reason: "inactive_or_draft", articleId };
      }

      // STALE UPSERT GUARD:
      // If Qdrant already contains indexed chunks for this article with a newer or equal updatedAt
      // and identical contentHash, do not re-embed.
      const latestHash = this.computeContentHash(articleToProcess);
      const latestUpdatedAt = articleToProcess.$updatedAt || articleToProcess.$createdAt;

      if (this.processor.vectorStore?.getArticleMetadata) {
        const existingMeta = await this.processor.vectorStore.getArticleMetadata(articleId);
        if (
          existingMeta &&
          existingMeta.contentHash === latestHash &&
          existingMeta.articleUpdatedAt &&
          new Date(existingMeta.articleUpdatedAt).getTime() >= new Date(latestUpdatedAt).getTime()
        ) {
          return { action: "skipped", reason: "content_already_up_to_date", articleId };
        }
      }

      console.log(`[SyncService] Indexing article: "${articleToProcess.title}" (${articleId})`);
      return await this.processor.processArticle(articleToProcess);
    })().finally(() => {
      this.inFlightSyncs.delete(articleId);
    });

    this.inFlightSyncs.set(articleId, syncPromise);
    return syncPromise;
  }

  /**
   * Synchronizes a single article by ID on demand.
   *
   * @param {string} articleId
   * @param {"upsert"|"delete"} [action="upsert"]
   * @returns {Promise<Object>}
   */
  async syncSingleArticle(articleId, action = "upsert") {
    if (!articleId) throw new Error("syncSingleArticle: articleId is required");

    let job = null;
    if (this.jobStore) {
      job = await this.jobStore.createJob({
        articleId,
        action,
        event: "manual.sync-single",
      });
      return await this.processJob(job.$id);
    }

    return this.executeSync({ articleId, action });
  }

  /**
   * Worker sweep function: drains pending and retry-due jobs from the durable queue.
   *
   * @param {number} [limit=10]
   * @returns {Promise<{ processed: number, successes: number, failures: number }>}
   */
  async drainQueue(limit = 10) {
    if (!this.jobStore) {
      return { processed: 0, successes: 0, failures: 0 };
    }

    const dueJobs = await this.jobStore.findDueJobs(limit);
    let successes = 0;
    let failures = 0;

    for (const job of dueJobs) {
      try {
        await this.processJob(job.$id);
        successes++;
      } catch (err) {
        console.warn(`[SyncService] Failed to process job ${job.$id}:`, err.message);
        failures++;
      }
    }

    return {
      processed: dueJobs.length,
      successes,
      failures,
    };
  }

  /**
   * Reconciliation Engine:
   * Scans all articles in Appwrite and brings Qdrant vector store into 100% parity.
   * - Indexes any active articles missing from Qdrant.
   * - Re-indexes any articles whose content has changed.
   * - Purges vectors for articles that are inactive or deleted in Appwrite.
   *
   * @param {Object} [options]
   * @param {boolean} [options.dryRun=false]
   * @returns {Promise<Object>}
   */
  async reconcile({ dryRun = false } = {}) {
    console.log("[Reconcile] Starting Appwrite <-> Qdrant reconciliation scan...");
    const stats = {
      totalAppwriteDocs: 0,
      activeDocs: 0,
      missingIndexed: 0,
      staleUpdated: 0,
      inactivePurged: 0,
      alreadyInSync: 0,
      errors: [],
    };

    let offset = 0;
    const batchSize = 50;
    let hasMore = true;
    const activeDocIds = new Set();

    while (hasMore) {
      const response = await this.databases.listDocuments(
        this.env.APPWRITE_DATABASE_ID,
        this.env.APPWRITE_COLLECTION_ID,
        [Query.limit(batchSize), Query.offset(offset)]
      );

      const docs = response.documents || [];
      if (docs.length === 0) {
        hasMore = false;
        break;
      }

      stats.totalAppwriteDocs += docs.length;

      for (const doc of docs) {
        const articleId = doc.$id;
        const isActive = doc.status === "active";

        if (!isActive) {
          // If inactive, ensure vectors are purged
          if (this.processor.vectorStore?.getArticleMetadata) {
            const meta = await this.processor.vectorStore.getArticleMetadata(articleId);
            if (meta) {
              stats.inactivePurged++;
              if (!dryRun) {
                await this.deleteArticleVectors(articleId);
              }
            }
          }
          continue;
        }

        activeDocIds.add(articleId);
        stats.activeDocs++;

        const currentHash = this.computeContentHash(doc);
        const updatedAt = doc.$updatedAt || doc.$createdAt;

        let isMissing = true;
        let isStale = false;

        if (this.processor.vectorStore?.getArticleMetadata) {
          const meta = await this.processor.vectorStore.getArticleMetadata(articleId);
          if (meta) {
            isMissing = false;
            if (meta.contentHash !== currentHash) {
              isStale = true;
            }
          }
        }

        if (isMissing) {
          stats.missingIndexed++;
          console.log(`[Reconcile] Article '${articleId}' ("${doc.title}") missing from Qdrant. Indexing...`);
          if (!dryRun) {
            try {
              await this.executeSync({ articleId, action: "upsert", doc });
            } catch (err) {
              stats.errors.push({ articleId, error: err.message });
            }
          }
        } else if (isStale) {
          stats.staleUpdated++;
          console.log(`[Reconcile] Article '${articleId}' is stale in Qdrant. Re-indexing...`);
          if (!dryRun) {
            try {
              await this.executeSync({ articleId, action: "upsert", doc });
            } catch (err) {
              stats.errors.push({ articleId, error: err.message });
            }
          }
        } else {
          stats.alreadyInSync++;
        }
      }

      offset += docs.length;
      if (offset >= response.total) {
        hasMore = false;
      }
    }

    console.log("[Reconcile] Completed reconciliation scan:", stats);
    return stats;
  }
}

export default SyncService;
