import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { SyncService } from "../services/sync.service.js";
import { SyncJobStore } from "../services/job.store.js";
import { ArticleProcessor } from "../pipeline/article.processor.js";

describe("Automatic RAG Synchronization Integration Tests (TablesDB)", () => {
  const mockEnv = {
    WEBHOOK_SECRET: "secure_webhook_secret_xyz",
    APPWRITE_DATABASE_ID: "6a53b1a4002566268803",
    APPWRITE_TABLE_ID: "articles",
    APPWRITE_SYNC_JOBS_TABLE_ID: "6af2a4b5001496679e4c",
    APPWRITE_ENDPOINT: "https://cloud.appwrite.io/v1",
    APPWRITE_PROJECT_ID: "test_project",
    APPWRITE_API_KEY: "test_key",
    NODE_ENV: "test",
  };

  function createMockEnvironment() {
    const vectorData = new Map(); // articleId -> points[]
    const appwriteRows = new Map(); // articleId -> row
    const syncJobRows = new Map(); // jobId -> row

    const mockVectorStore = {
      upsertPoints: async (points) => {
        for (const pt of points) {
          const artId = pt.payload.articleId;
          if (!vectorData.has(artId)) vectorData.set(artId, []);
          vectorData.get(artId).push(pt);
        }
        return { status: "completed", count: points.length };
      },
      deleteByArticleId: async (articleId) => {
        const existed = vectorData.has(articleId);
        vectorData.delete(articleId);
        return { status: "completed", deleted: existed };
      },
      getArticleMetadata: async (articleId) => {
        const pts = vectorData.get(articleId);
        return pts?.[0]?.payload || null;
      },
      search: async () => [],
    };

    let embedCallCount = 0;
    let shouldFailEmbedding = false;

    const mockEmbeddingProvider = {
      embedBatch: async (texts) => {
        embedCallCount++;
        if (shouldFailEmbedding) {
          throw new Error("OpenRouter API 500: Rate limit or temporary outage");
        }
        return texts.map(() => new Array(1536).fill(0.1));
      },
      embedQuery: async () => new Array(1536).fill(0.1),
    };

    const processor = new ArticleProcessor({
      vectorStore: mockVectorStore,
      embeddingProvider: mockEmbeddingProvider,
      chunkConfig: { chunkSize: 500, chunkOverlap: 50 },
    });

    const mockTablesDB = {
      getRow: async ({ tableId, rowId }) => {
        const targetMap = tableId === mockEnv.APPWRITE_SYNC_JOBS_TABLE_ID ? syncJobRows : appwriteRows;
        if (!targetMap.has(rowId)) {
          const err = new Error(`Row with ID ${rowId} could not be found`);
          err.code = 404;
          throw err;
        }
        return targetMap.get(rowId);
      },
      listRows: async ({ tableId }) => {
        const targetMap = tableId === mockEnv.APPWRITE_SYNC_JOBS_TABLE_ID ? syncJobRows : appwriteRows;
        const rows = Array.from(targetMap.values());
        return { total: rows.length, rows };
      },
      createRow: async ({ tableId, rowId, data }) => {
        const now = new Date().toISOString();
        const id = rowId === "unique()" ? "job_" + Math.random().toString(36).substring(2, 11) : rowId;
        const row = { $id: id, ...data, $createdAt: now, $updatedAt: now };
        if (tableId === mockEnv.APPWRITE_SYNC_JOBS_TABLE_ID) {
          syncJobRows.set(id, row);
        } else {
          appwriteRows.set(id, row);
        }
        return row;
      },
      updateRow: async ({ tableId, rowId, data }) => {
        const targetMap = tableId === mockEnv.APPWRITE_SYNC_JOBS_TABLE_ID ? syncJobRows : appwriteRows;
        const existing = targetMap.get(rowId);
        if (!existing) {
          const err = new Error(`Row with ID ${rowId} could not be found`);
          err.code = 404;
          throw err;
        }
        const updated = { ...existing, ...data, $updatedAt: new Date().toISOString() };
        targetMap.set(rowId, updated);
        return updated;
      },
    };

    const jobStore = new SyncJobStore({
      tablesDB: mockTablesDB,
      databaseId: mockEnv.APPWRITE_DATABASE_ID,
      tableId: mockEnv.APPWRITE_SYNC_JOBS_TABLE_ID,
      nodeEnv: "test",
    });

    const syncService = new SyncService({
      processor,
      env: mockEnv,
      jobStore,
      tablesDB: mockTablesDB,
    });

    return {
      vectorData,
      appwriteRows,
      syncJobRows,
      processor,
      jobStore,
      syncService,
      getEmbedCallCount: () => embedCallCount,
      setFailEmbedding: (fail) => {
        shouldFailEmbedding = fail;
      },
    };
  }

  test("1. Publish: new active article row is automatically chunked, embedded, and stored", async () => {
    const env = createMockEnvironment();
    const row = {
      $id: "art_101",
      $createdAt: "2026-11-10T00:00:00.000Z",
      $updatedAt: "2026-11-10T00:00:00.000Z",
      title: "Introduction to RAG in StoryNest",
      status: "active",
      category: "AI",
      tags: "rag, ai",
      content: "<p>Retrieval-Augmented Generation combines search with generative AI for grounded facts.</p>",
    };
    env.appwriteRows.set(row.$id, row);

    const result = await env.syncService.handleWebhookEvent({
      event: "tablesdb.6a53b1a4002566268803.tables.articles.rows.art_101.create",
      payload: row,
    });

    assert.equal(result.success, true);
    assert.equal(result.action, "upsert");
    assert.ok(env.vectorData.has("art_101"));
    const points = env.vectorData.get("art_101");
    assert.ok(points.length >= 1);
    assert.equal(points[0].payload.title, "Introduction to RAG in StoryNest");
    assert.equal(points[0].payload.status, "active");
    assert.equal(env.syncJobRows.size, 1);
    const jobRow = Array.from(env.syncJobRows.values())[0];
    assert.equal(jobRow.status, "completed");
  });

  test("2. Update: edited article row replaces old chunks with updated content and contentHash", async () => {
    const env = createMockEnvironment();
    const v1 = {
      $id: "art_102",
      $createdAt: "2026-11-10T00:00:00.000Z",
      $updatedAt: "2026-11-10T00:00:00.000Z",
      title: "Version One",
      status: "active",
      content: "<p>Initial text content for version one.</p>",
    };
    env.appwriteRows.set(v1.$id, v1);
    await env.syncService.handleWebhookEvent({
      event: "tablesdb.6a53b1a4002566268803.tables.articles.rows.art_102.create",
      payload: v1,
    });
    const hashV1 = env.vectorData.get("art_102")[0].payload.contentHash;

    // Update article row content
    const v2 = {
      ...v1,
      $updatedAt: "2026-11-10T01:00:00.000Z",
      title: "Version Two - Heavily Expanded",
      content: "<p>Updated content with significant architectural explanations and details.</p>",
    };
    env.appwriteRows.set(v2.$id, v2);

    await env.syncService.handleWebhookEvent({
      event: "tablesdb.6a53b1a4002566268803.tables.articles.rows.art_102.update",
      payload: v2,
    });

    const pointsV2 = env.vectorData.get("art_102");
    assert.equal(pointsV2[0].payload.title, "Version Two - Heavily Expanded");
    assert.notEqual(pointsV2[0].payload.contentHash, hashV1);
    assert.equal(pointsV2[0].payload.articleUpdatedAt, "2026-11-10T01:00:00.000Z");
  });

  test("3. Unpublish: updating status to inactive purges vectors from store", async () => {
    const env = createMockEnvironment();
    const row = {
      $id: "art_103",
      $createdAt: "2026-11-10T00:00:00.000Z",
      $updatedAt: "2026-11-10T00:00:00.000Z",
      title: "To Be Unpublished",
      status: "active",
      content: "<p>Active text content.</p>",
    };
    env.appwriteRows.set(row.$id, row);
    await env.syncService.handleWebhookEvent({
      event: "tablesdb.6a53b1a4002566268803.tables.articles.rows.art_103.create",
      payload: row,
    });
    assert.ok(env.vectorData.has("art_103"));

    // Unpublish
    const unpublished = {
      ...row,
      $updatedAt: "2026-11-10T02:00:00.000Z",
      status: "inactive",
    };
    env.appwriteRows.set(row.$id, unpublished);

    await env.syncService.handleWebhookEvent({
      event: "tablesdb.6a53b1a4002566268803.tables.articles.rows.art_103.update",
      payload: unpublished,
    });

    assert.equal(env.vectorData.has("art_103"), false);
  });

  test("4. Delete: row delete event immediately removes vectors", async () => {
    const env = createMockEnvironment();
    const row = {
      $id: "art_104",
      $createdAt: "2026-11-10T00:00:00.000Z",
      $updatedAt: "2026-11-10T00:00:00.000Z",
      title: "Deleted Soon",
      status: "active",
      content: "<p>Soon to be deleted.</p>",
    };
    env.appwriteRows.set(row.$id, row);
    await env.syncService.handleWebhookEvent({
      event: "tablesdb.6a53b1a4002566268803.tables.articles.rows.art_104.create",
      payload: row,
    });
    assert.ok(env.vectorData.has("art_104"));

    // Delete in Appwrite
    env.appwriteRows.delete("art_104");

    await env.syncService.handleWebhookEvent({
      event: "tablesdb.6a53b1a4002566268803.tables.articles.rows.art_104.delete",
      payload: { $id: "art_104" },
    });

    assert.equal(env.vectorData.has("art_104"), false);
  });

  test("5. Idempotency: duplicate webhook delivery does not duplicate chunks or re-embed", async () => {
    const env = createMockEnvironment();
    const row = {
      $id: "art_105",
      $createdAt: "2026-11-10T00:00:00.000Z",
      $updatedAt: "2026-11-10T00:00:00.000Z",
      title: "Duplicate Test",
      status: "active",
      content: "<p>Text content for duplicate test.</p>",
    };
    env.appwriteRows.set(row.$id, row);

    // Delivery 1
    await env.syncService.handleWebhookEvent({
      event: "tablesdb.6a53b1a4002566268803.tables.articles.rows.art_105.create",
      payload: row,
    });
    const embedCallsFirst = env.getEmbedCallCount();
    assert.equal(embedCallsFirst, 1);

    // Delivery 2 (Identical webhook re-delivered)
    const res2 = await env.syncService.handleWebhookEvent({
      event: "tablesdb.6a53b1a4002566268803.tables.articles.rows.art_105.create",
      payload: row,
    });

    // Embedding provider should NOT be called again
    assert.equal(env.getEmbedCallCount(), 1);
    assert.equal(res2.action, "skipped");
  });

  test("6. Stale Delete Protection: delayed delete event does not remove newer active article", async () => {
    const env = createMockEnvironment();
    const row = {
      $id: "art_106",
      $createdAt: "2026-11-10T00:00:00.000Z",
      $updatedAt: "2026-11-10T05:00:00.000Z", // Newer published timestamp
      title: "Active and Fresh",
      status: "active",
      content: "<p>This is newly published at t=5.</p>",
    };
    env.appwriteRows.set(row.$id, row);
    await env.syncService.executeSync({ articleId: "art_106", action: "upsert", doc: row });
    assert.ok(env.vectorData.has("art_106"));

    // Stale delete event from an earlier draft toggle at t=2
    const staleDeleteEvent = {
      event: "tablesdb.6a53b1a4002566268803.tables.articles.rows.art_106.delete",
      payload: { $id: "art_106", $updatedAt: "2026-11-10T02:00:00.000Z" },
    };

    await env.syncService.handleWebhookEvent(staleDeleteEvent);

    // Stale delete must be rejected, vectors must stay preserved
    assert.ok(env.vectorData.has("art_106"));
  });

  test("7. Failed Embedding & Retry Backoff: records failure and updates attempts via TablesDB", async () => {
    const env = createMockEnvironment();
    const row = {
      $id: "art_107",
      title: "Failing Embedding Test",
      status: "active",
      content: "<p>Will fail initially then succeed.</p>",
    };
    env.appwriteRows.set(row.$id, row);

    // Simulate OpenRouter 500 failure
    env.setFailEmbedding(true);

    await assert.rejects(
      async () =>
        env.syncService.handleWebhookEvent({
          event: "tablesdb.6a53b1a4002566268803.tables.articles.rows.art_107.create",
          payload: row,
        }),
      /Rate limit or temporary outage/
    );

    // Verify job row in TablesDB recorded the failure and set backoff
    const jobs = Array.from(env.syncJobRows.values());
    const job = jobs.find((j) => j.articleId === "art_107");
    assert.ok(job);
    assert.equal(job.attempts, 1);
    assert.equal(job.status, "pending");
    assert.ok(job.lastError.includes("Rate limit or temporary outage"));
    assert.ok(job.nextRetryAt);

    // Now restore OpenRouter service and run worker drain
    env.setFailEmbedding(false);
    const sweep = await env.syncService.drainQueue();
    assert.equal(sweep.successes, 1);
    assert.equal(env.syncJobRows.get(job.$id).status, "completed");
    assert.ok(env.vectorData.has("art_107"));
  });

  test("8. Concurrent Workers: worker lease prevents collision on the same job row", async () => {
    const env = createMockEnvironment();
    const job = await env.jobStore.createJob({
      articleId: "art_108",
      action: "upsert",
    });

    // Worker A acquires lease
    const leaseA = await env.jobStore.acquireLease(job.$id, 60000);
    assert.ok(leaseA);
    assert.equal(leaseA.status, "processing");

    // Worker B attempts to acquire lease on the same job before expiration
    const leaseB = await env.jobStore.acquireLease(job.$id, 60000);
    assert.equal(leaseB, null); // Blocked
  });

  test("9. Reconciliation: detects missing Appwrite articles using TablesDB.listRows() and synchronizes them", async () => {
    const env = createMockEnvironment();
    // Two articles in Appwrite TablesDB
    const row1 = {
      $id: "art_missing_1",
      title: "Missing RAG Article",
      status: "active",
      content: "<p>Detailed guide on RAG architectures.</p>",
    };
    const row2 = {
      $id: "art_already_synced",
      title: "Already Synced",
      status: "active",
      content: "<p>Already present in vector store.</p>",
    };

    env.appwriteRows.set(row1.$id, row1);
    env.appwriteRows.set(row2.$id, row2);

    // Pre-sync row2 only
    await env.syncService.executeSync({ articleId: "art_already_synced", action: "upsert", doc: row2 });
    assert.equal(env.vectorData.has("art_missing_1"), false);
    assert.equal(env.vectorData.has("art_already_synced"), true);

    // Run reconciliation
    const stats = await env.syncService.reconcile();
    assert.equal(stats.missingIndexed, 1);
    assert.equal(stats.alreadyInSync, 1);
    assert.equal(env.vectorData.has("art_missing_1"), true);
  });
});
