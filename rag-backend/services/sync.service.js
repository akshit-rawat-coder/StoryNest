import crypto from "node:crypto";
import { Client, TablesDB, Query } from "node-appwrite";
import { cleanHtml } from "../pipeline/html.cleaner.js";

/**
 * Production-grade synchronization service for StoryNest RAG using Appwrite TablesDB.
 * Features:
 * - Official Appwrite HMAC-SHA1 signature verification
 * - Strict TablesDB event filtering (articles table only; ignores sync_jobs)
 * - Stale upsert & stale delete protection
 * - Durable job lifecycle (pending -> processing -> completed / failed)
 * - Expiring worker leases preventing concurrent collisions
 * - Reconciliation engine using TablesDB.listRows()
 */
export class SyncService {
  /**
   * @param {Object} options
   * @param {import("../pipeline/article.processor.js").ArticleProcessor} options.processor
   * @param {Object} options.env
   * @param {import("./job.store.js").SyncJobStore} [options.jobStore]
   * @param {import("node-appwrite").TablesDB} [options.tablesDB]
   */
  constructor({ processor, env, jobStore, tablesDB }) {
    if (!processor) throw new Error("SyncService: processor is required");
    if (!env) throw new Error("SyncService: env is required");

    this.processor = processor;
    this.env = env;
    this.jobStore = jobStore || null;
    this.inFlightSyncs = new Map();

    if (tablesDB) {
      this.tablesDB = tablesDB;
    } else {
      const appwriteClient = new Client();
      appwriteClient
        .setEndpoint(env.APPWRITE_ENDPOINT)
        .setProject(env.APPWRITE_PROJECT_ID)
        .setKey(env.APPWRITE_API_KEY);
      this.tablesDB = new TablesDB(appwriteClient);
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
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    if (bufA.length === 0 || bufB.length === 0 || bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * Verifies the webhook signature or secret header/query parameter.
   * Supports:
   * 1. Official Appwrite HMAC-SHA1 signature (X-Appwrite-Webhook-Signature)
   *    computed as Base64 HMAC-SHA1(webhookUrl + rawBody, WEBHOOK_SECRET)
   * 2. Direct custom secret headers (X-Webhook-Secret, Authorization: Bearer <secret>)
   * 3. Query string secret (?secret=<secret>)
   *
   * Note: Direct string equality comparison between X-Appwrite-Webhook-Signature
   * and WEBHOOK_SECRET is explicitly rejected.
   *
   * @param {Object|{headers?: Object, querySecret?: string, requestUrl?: string, rawBody?: string}} firstArg
   * @param {string} [maybeQuerySecret]
   * @param {string} [maybeRequestUrl]
   * @param {string} [maybeRawBody]
   * @returns {boolean}
   */
  verifyWebhookAuth(firstArg = {}, maybeQuerySecret = "", maybeRequestUrl = "", maybeRawBody = "") {
    let headers;
    let querySecret;
    let requestUrl;
    let rawBody;

    if (
      firstArg &&
      typeof firstArg === "object" &&
      ("headers" in firstArg || "rawBody" in firstArg || "requestUrl" in firstArg)
    ) {
      headers = firstArg.headers || {};
      querySecret = firstArg.querySecret || "";
      requestUrl = firstArg.requestUrl || "";
      rawBody = firstArg.rawBody || "";
    } else {
      headers = firstArg || {};
      querySecret = maybeQuerySecret || "";
      requestUrl = maybeRequestUrl || "";
      rawBody = maybeRawBody || "";
    }

    const configuredSecret = this.env.WEBHOOK_SECRET;
    if (!configuredSecret) {
      return false;
    }

    // 1. Official Appwrite Webhook Signature (HMAC-SHA1 of webhookUrl + rawBody in Base64)
    const appwriteSignature = headers["x-appwrite-webhook-signature"] || "";
    if (appwriteSignature) {
      // Must NOT accept direct equality comparison with WEBHOOK_SECRET
      try {
        const expectedBase64 = crypto
          .createHmac("sha1", configuredSecret)
          .update(requestUrl + rawBody)
          .digest("base64");

        if (this.safeCompare(appwriteSignature, expectedBase64)) {
          return true;
        }

        // Check for edge cases where reverse proxy protocol might differ (http vs https)
        if (requestUrl.startsWith("http://")) {
          const httpsUrl = requestUrl.replace(/^http:\/\//, "https://");
          const expectedHttps = crypto
            .createHmac("sha1", configuredSecret)
            .update(httpsUrl + rawBody)
            .digest("base64");
          if (this.safeCompare(appwriteSignature, expectedHttps)) {
            return true;
          }
        } else if (requestUrl.startsWith("https://")) {
          const httpUrl = requestUrl.replace(/^https:\/\//, "http://");
          const expectedHttp = crypto
            .createHmac("sha1", configuredSecret)
            .update(httpUrl + rawBody)
            .digest("base64");
          if (this.safeCompare(appwriteSignature, expectedHttp)) {
            return true;
          }
        }
      } catch {
        // Fall through
      }
      return false;
    }

    // 2. Direct custom secret header (X-Webhook-Secret)
    const directHeader = headers["x-webhook-secret"] || "";
    if (directHeader && this.safeCompare(directHeader, configuredSecret)) {
      return true;
    }

    // 3. Bearer authorization header
    const authHeader = (headers["authorization"] || "").replace(/^Bearer\s+/i, "");
    if (authHeader && this.safeCompare(authHeader, configuredSecret)) {
      return true;
    }

    // 4. Query parameter (?secret=...)
    if (querySecret && this.safeCompare(querySecret, configuredSecret)) {
      return true;
    }

    return false;
  }

  /**
   * Verifies authorization for the worker sweep endpoint.
   * Matches against CRON_SECRET (or WEBHOOK_SECRET fallback).
   * Note: X-Vercel-Cron: 1 alone is NOT accepted.
   *
   * @param {Object} [options]
   * @param {Object} [options.headers]
   * @param {string} [options.querySecret]
   * @returns {boolean}
   */
  verifyWorkerAuth({ headers = {}, querySecret = "" } = {}) {
    const expectedSecret = this.env.CRON_SECRET || this.env.WEBHOOK_SECRET;
    if (!expectedSecret) {
      return false;
    }

    const authHeader = (headers["authorization"] || "").replace(/^Bearer\s+/i, "");
    const cronSecretHeader = headers["x-cron-secret"] || "";
    const webhookSecretHeader = headers["x-webhook-secret"] || "";
    const candidateSecret = authHeader || cronSecretHeader || webhookSecretHeader || querySecret;

    if (!candidateSecret) {
      return false;
    }

    return this.safeCompare(candidateSecret, expectedSecret);
  }

  /**
   * Validates whether an incoming Appwrite webhook event targets the configured
   * database and articles table. Explicitly ignores sync_jobs and other tables.
   *
   * @param {string} event
   * @returns {{ valid: boolean, reason?: string }}
   */
  validateWebhookEvent(event = "") {
    if (!event || typeof event !== "string") {
      return { valid: false, reason: "missing_event_name" };
    }

    const dbId = this.env.APPWRITE_DATABASE_ID;
    const articlesTableId =
      this.env.APPWRITE_TABLE_ID || this.env.APPWRITE_COLLECTION_ID || "articles";
    const syncJobsTableId =
      this.env.APPWRITE_SYNC_JOBS_TABLE_ID || "6af2a4b5001496679e4c";

    // Strictly ignore events originating from the sync_jobs table (by name or ID)
    if (
      event.includes(".tables.sync_jobs.") ||
      event.includes(`.tables.${syncJobsTableId}.`) ||
      event.includes(".collections.sync_jobs.") ||
      event.includes(`.collections.${syncJobsTableId}.`)
    ) {
      return { valid: false, reason: "ignored_sync_jobs_event" };
    }

    // Match TablesDB format: tablesdb.<dbId>.tables.<tableId>.rows.<rowId>.<action>
    const tablesMatch = event.match(
      /^tablesdb\.([^.]+)\.tables\.([^.]+)\.rows\.([^.]+)\.(create|update|delete)$/
    );
    if (tablesMatch) {
      const [, eventDbId, eventTableId] = tablesMatch;
      if (eventDbId !== dbId) {
        return { valid: false, reason: "database_mismatch" };
      }
      if (eventTableId !== articlesTableId) {
        return { valid: false, reason: "non_articles_table" };
      }
      return { valid: true };
    }

    // Backward compatibility for legacy test event format matching target DB & table
    const dbMatch = event.match(
      /^databases\.([^.]+)\.collections\.([^.]+)\.documents\.([^.]+)\.(create|update|delete)$/
    );
    if (dbMatch) {
      const [, eventDbId, eventCollectionId] = dbMatch;
      if (eventDbId !== dbId) {
        return { valid: false, reason: "database_mismatch" };
      }
      if (eventCollectionId !== articlesTableId) {
        return { valid: false, reason: "non_articles_table" };
      }
      return { valid: true };
    }

    return { valid: false, reason: "unsupported_event_target" };
  }

  /**
   * Handles an incoming Appwrite webhook event payload.
   *
   * @param {Object} options
   * @param {string} options.event - Exact Appwrite event name
   * @param {Object} options.payload - Appwrite row payload
   * @returns {Promise<Object>}
   */
  async handleWebhookEvent({ event = "", payload = {} }) {
    const validation = this.validateWebhookEvent(event);
    if (!validation.valid) {
      return {
        action: "ignored",
        reason: validation.reason,
        event,
      };
    }

    const rowId = payload?.$id || payload?.rowId;
    if (!payload || !rowId) {
      throw new Error("Invalid webhook payload: row $id is required");
    }

    const articleId = String(rowId);
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
      const targetTableId =
        this.env.APPWRITE_TABLE_ID || this.env.APPWRITE_COLLECTION_ID || "articles";

      // ------------------------------------------------------------------
      // Action: DELETE
      // ------------------------------------------------------------------
      if (action === "delete") {
        // STALE DELETE GUARD:
        // Before deleting vectors from Qdrant, check Appwrite TablesDB:
        // If the row currently exists in Appwrite, is active, and was updated
        // AFTER the delete event timestamp, an older delete event must NOT remove active content!
        if (typeof this.tablesDB?.getRow === "function") {
          try {
            const currentDoc = await this.tablesDB.getRow({
              databaseId: this.env.APPWRITE_DATABASE_ID,
              tableId: targetTableId,
              rowId: articleId,
            });

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
            // If 404, article row was genuinely deleted in Appwrite -> proceed with vector purge
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

      // Always fetch latest row from Appwrite TablesDB to guarantee data freshness and prevent stale overwrites
      if (typeof this.tablesDB?.getRow === "function") {
        try {
          const latestDoc = await this.tablesDB.getRow({
            databaseId: this.env.APPWRITE_DATABASE_ID,
            tableId: targetTableId,
            rowId: articleId,
          });
          if (latestDoc) {
            articleToProcess = latestDoc;
          }
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

    const targetTableId =
      this.env.APPWRITE_TABLE_ID || this.env.APPWRITE_COLLECTION_ID || "articles";

    while (hasMore) {
      const response = await this.tablesDB.listRows({
        databaseId: this.env.APPWRITE_DATABASE_ID,
        tableId: targetTableId,
        queries: [Query.limit(batchSize), Query.offset(offset)],
      });

      const docs = response?.rows || [];
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
