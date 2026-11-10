import { ID, Query } from "node-appwrite";

/**
 * Durable Job Store backed by Appwrite's `sync_jobs` collection.
 * Provides safe worker lease acquisition, retry scheduling with exponential backoff,
 * and job lifecycle state tracking.
 */
export class SyncJobStore {
  /**
   * @param {Object} options
   * @param {import("node-appwrite").Databases} options.databases
   * @param {string} options.databaseId
   * @param {string} [options.collectionId="sync_jobs"]
   * @param {string} [options.nodeEnv="development"]
   */
  constructor({ databases, databaseId, collectionId = "sync_jobs", nodeEnv = "development" }) {
    if (!databases) throw new Error("SyncJobStore: databases client is required");
    if (!databaseId) throw new Error("SyncJobStore: databaseId is required");

    this.databases = databases;
    this.databaseId = databaseId;
    this.collectionId = collectionId;
    this.nodeEnv = nodeEnv;
    this.isProduction = nodeEnv === "production";

    // In-memory test store used ONLY in test suites when injected
    this.testStore = new Map();
    this.useTestStore = false;
  }

  /**
   * Enables mock in-memory storage for isolated unit tests.
   */
  enableTestMode() {
    this.useTestStore = true;
  }

  /**
   * Persists a new synchronization job.
   *
   * @param {Object} params
   * @param {string} params.articleId - Target Appwrite article ID
   * @param {"upsert"|"delete"} params.action
   * @param {string} [params.event] - Webhook event name
   * @param {string} [params.contentHash] - SHA-256 of article content
   * @param {string} [params.articleUpdatedAt] - Appwrite document $updatedAt
   * @param {number} [params.maxAttempts=3]
   * @returns {Promise<Object>} Created job record
   */
  async createJob({
    articleId,
    action,
    event = "",
    contentHash = "",
    articleUpdatedAt = "",
    maxAttempts = 3,
  }) {
    if (!articleId) throw new Error("createJob: articleId is required");
    if (!action) throw new Error("createJob: action is required");

    const now = new Date().toISOString();
    const jobData = {
      articleId: String(articleId),
      action: String(action),
      status: "pending",
      attempts: 0,
      maxAttempts: Number(maxAttempts) || 3,
      contentHash: String(contentHash || ""),
      articleUpdatedAt: String(articleUpdatedAt || ""),
      lastError: "",
      event: String(event || ""),
      nextRetryAt: now,
      lockedAt: "",
    };

    if (this.useTestStore) {
      const jobId = "job_" + Math.random().toString(36).substring(2, 11);
      const record = { $id: jobId, ...jobData, $createdAt: now, $updatedAt: now };
      this.testStore.set(jobId, record);
      return record;
    }

    try {
      const doc = await this.databases.createDocument(
        this.databaseId,
        this.collectionId,
        ID.unique(),
        jobData
      );
      return doc;
    } catch (err) {
      const isMissingCollection = err.code === 404 || err.message?.includes("Collection not found");
      const isScopeIssue = err.code === 401 || err.type === "general_unauthorized_scope";

      if (this.isProduction) {
        console.error(
          `[SyncJobStore] CRITICAL: Durable job store '${this.collectionId}' is unavailable in Appwrite. Error: ${err.message}`
        );
        throw new Error(
          `Durable job store '${this.collectionId}' is unavailable in Appwrite. Please ensure the collection is created with proper scopes.`
        );
      }

      // Non-production warning
      console.warn(
        `[SyncJobStore] Warning: Appwrite '${this.collectionId}' unavailable (${err.message}). Using local fallback for testing.`
      );
      const jobId = "job_" + Math.random().toString(36).substring(2, 11);
      const fallbackRecord = { $id: jobId, ...jobData, $createdAt: now, $updatedAt: now };
      this.testStore.set(jobId, fallbackRecord);
      return fallbackRecord;
    }
  }

  /**
   * Acquires a lease on a job for worker execution.
   * Prevents concurrent workers from processing the same job.
   *
   * @param {string} jobId
   * @param {number} [leaseDurationMs=60000] - Lease expiration window (default 60s)
   * @returns {Promise<Object|null>} Leased job document or null if lease could not be acquired
   */
  async acquireLease(jobId, leaseDurationMs = 60000) {
    if (!jobId) return null;

    const now = new Date();
    const lockedAt = now.toISOString();

    if (this.useTestStore) {
      const job = this.testStore.get(jobId);
      if (!job) return null;

      // Check if locked and lease is still valid
      if (job.status === "processing" && job.lockedAt) {
        const lockAge = now.getTime() - new Date(job.lockedAt).getTime();
        if (lockAge < leaseDurationMs) {
          return null; // Active lease held by another worker
        }
      }

      job.status = "processing";
      job.lockedAt = lockedAt;
      job.attempts = (job.attempts || 0) + 1;
      job.$updatedAt = lockedAt;
      return job;
    }

    try {
      const current = await this.databases.getDocument(
        this.databaseId,
        this.collectionId,
        jobId
      );

      if (current.status === "processing" && current.lockedAt) {
        const lockAge = now.getTime() - new Date(current.lockedAt).getTime();
        if (lockAge < leaseDurationMs) {
          return null; // Active lease held by another worker
        }
      }

      const updated = await this.databases.updateDocument(
        this.databaseId,
        this.collectionId,
        jobId,
        {
          status: "processing",
          lockedAt,
          attempts: (current.attempts || 0) + 1,
        }
      );
      return updated;
    } catch (err) {
      console.warn(`[SyncJobStore] Failed to acquire lease on job ${jobId}:`, err.message);
      return null;
    }
  }

  /**
   * Marks a job as completed.
   *
   * @param {string} jobId
   * @param {Object} [details]
   * @returns {Promise<Object>}
   */
  async markCompleted(jobId, details = {}) {
    const now = new Date().toISOString();
    const updatePayload = {
      status: "completed",
      lockedAt: "",
      lastError: "",
    };

    if (this.useTestStore) {
      const job = this.testStore.get(jobId);
      if (job) {
        Object.assign(job, updatePayload, details, { $updatedAt: now });
        return job;
      }
      return null;
    }

    try {
      return await this.databases.updateDocument(
        this.databaseId,
        this.collectionId,
        jobId,
        updatePayload
      );
    } catch (err) {
      console.error(`[SyncJobStore] Failed to mark job ${jobId} as completed:`, err.message);
      return null;
    }
  }

  /**
   * Marks a job as failed, recording error and scheduling exponential backoff.
   *
   * @param {string} jobId
   * @param {Error|string} error
   * @param {Object} [options]
   * @param {number} [options.backoffBaseMs=15000] - Base retry delay (15s)
   * @returns {Promise<Object>}
   */
  async markFailed(jobId, error, { backoffBaseMs = 15000 } = {}) {
    const errorMsg = String(error?.message || error || "Unknown error").slice(0, 1990);
    const now = new Date();

    if (this.useTestStore) {
      const job = this.testStore.get(jobId);
      if (job) {
        const attempts = job.attempts || 1;
        const maxAttempts = job.maxAttempts || 3;
        const isExhausted = attempts >= maxAttempts;

        const delay = Math.min(300000, backoffBaseMs * Math.pow(2, attempts - 1));
        const nextRetryAt = new Date(now.getTime() + delay).toISOString();

        job.status = isExhausted ? "failed" : "pending";
        job.lockedAt = "";
        job.lastError = errorMsg;
        job.nextRetryAt = nextRetryAt;
        job.$updatedAt = now.toISOString();
        return job;
      }
      return null;
    }

    try {
      const current = await this.databases.getDocument(
        this.databaseId,
        this.collectionId,
        jobId
      );

      const attempts = current.attempts || 1;
      const maxAttempts = current.maxAttempts || 3;
      const isExhausted = attempts >= maxAttempts;

      const delay = Math.min(300000, backoffBaseMs * Math.pow(2, attempts - 1));
      const nextRetryAt = new Date(now.getTime() + delay).toISOString();

      return await this.databases.updateDocument(
        this.databaseId,
        this.collectionId,
        jobId,
        {
          status: isExhausted ? "failed" : "pending",
          lockedAt: "",
          lastError: errorMsg,
          nextRetryAt,
        }
      );
    } catch (err) {
      console.error(`[SyncJobStore] Failed to update failed status for job ${jobId}:`, err.message);
      return null;
    }
  }

  /**
   * Retrieves jobs that are pending or due for retry.
   *
   * @param {number} [limit=10]
   * @returns {Promise<Array<Object>>}
   */
  async findDueJobs(limit = 10) {
    const now = new Date();

    if (this.useTestStore) {
      const due = [];
      for (const job of this.testStore.values()) {
        if (job.status === "pending") {
          due.push(job);
        } else if (
          job.status === "processing" &&
          job.lockedAt &&
          now.getTime() - new Date(job.lockedAt).getTime() > 60000
        ) {
          // Expired lease
          due.push(job);
        }
        if (due.length >= limit) break;
      }
      return due;
    }

    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.collectionId,
        [Query.equal("status", "pending"), Query.limit(limit)]
      );
      return response.documents || [];
    } catch (err) {
      console.warn(`[SyncJobStore] findDueJobs query failed:`, err.message);
      return [];
    }
  }

  /**
   * Retrieves operational job statistics for the monitoring endpoint.
   *
   * @returns {Promise<{ metrics: Record<string, number>, recentJobs: Array<Object> }>}
   */
  async getJobStats() {
    if (this.useTestStore) {
      const metrics = { pending: 0, processing: 0, completed: 0, failed: 0 };
      const jobs = Array.from(this.testStore.values());
      for (const j of jobs) {
        if (metrics[j.status] !== undefined) metrics[j.status]++;
      }
      return {
        metrics,
        recentJobs: jobs.slice(-10).reverse().map((j) => ({
          jobId: j.$id,
          articleId: j.articleId,
          action: j.action,
          status: j.status,
          attempts: j.attempts,
          lastError: j.lastError ? j.lastError.slice(0, 100) : null,
          createdAt: j.$createdAt,
          updatedAt: j.$updatedAt,
        })),
      };
    }

    try {
      const res = await this.databases.listDocuments(
        this.databaseId,
        this.collectionId,
        [Query.orderDesc("$createdAt"), Query.limit(20)]
      );
      const metrics = { pending: 0, processing: 0, completed: 0, failed: 0 };
      const recentJobs = (res.documents || []).map((j) => {
        if (metrics[j.status] !== undefined) metrics[j.status]++;
        return {
          jobId: j.$id,
          articleId: j.articleId,
          action: j.action,
          status: j.status,
          attempts: j.attempts,
          lastError: j.lastError ? j.lastError.slice(0, 100) : null,
          createdAt: j.$createdAt,
          updatedAt: j.$updatedAt,
        };
      });

      return { metrics, recentJobs };
    } catch {
      return {
        metrics: { pending: 0, processing: 0, completed: 0, failed: 0 },
        recentJobs: [],
      };
    }
  }
}

