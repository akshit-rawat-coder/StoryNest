import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { SyncService } from "../services/sync.service.js";
import { SyncJobStore } from "../services/job.store.js";

describe("SyncService Unit Tests", () => {
  const mockEnv = {
    WEBHOOK_SECRET: "test_secret_123",
    APPWRITE_DATABASE_ID: "6a53b1a4002566268803",
    APPWRITE_TABLE_ID: "articles",
    APPWRITE_SYNC_JOBS_TABLE_ID: "6af2a4b5001496679e4c",
    APPWRITE_ENDPOINT: "https://cloud.appwrite.io/v1",
    APPWRITE_PROJECT_ID: "test_project",
    APPWRITE_API_KEY: "test_key",
  };

  test("verifyWebhookAuth validates HMAC-SHA1 signature and custom secret headers", () => {
    const service = new SyncService({
      processor: { processArticle: async () => {}, deleteArticle: async () => {} },
      env: mockEnv,
      tablesDB: {},
    });

    const url = "https://storynest.example.com/api/webhooks/appwrite";
    const rawBody = JSON.stringify({ event: "create", payload: { $id: "doc_1" } });

    // 1. Valid HMAC-SHA1 signature (Base64)
    const validSignature = crypto
      .createHmac("sha1", "test_secret_123")
      .update(url + rawBody)
      .digest("base64");

    assert.equal(
      service.verifyWebhookAuth({
        headers: { "x-appwrite-webhook-signature": validSignature },
        requestUrl: url,
        rawBody,
      }),
      true
    );

    // 2. Modified body produces signature mismatch
    assert.equal(
      service.verifyWebhookAuth({
        headers: { "x-appwrite-webhook-signature": validSignature },
        requestUrl: url,
        rawBody: JSON.stringify({ event: "create", payload: { $id: "doc_TAMPERED" } }),
      }),
      false
    );

    // 3. Invalid signature
    assert.equal(
      service.verifyWebhookAuth({
        headers: { "x-appwrite-webhook-signature": "invalid_base64_sig" },
        requestUrl: url,
        rawBody,
      }),
      false
    );

    // 4. Direct equality attempt (signature header equals secret plain text) MUST fail
    assert.equal(
      service.verifyWebhookAuth({
        headers: { "x-appwrite-webhook-signature": "test_secret_123" },
        requestUrl: url,
        rawBody,
      }),
      false
    );

    // 5. Custom header fallback
    assert.equal(service.verifyWebhookAuth({ "x-webhook-secret": "test_secret_123" }), true);
    assert.equal(service.verifyWebhookAuth({ authorization: "Bearer test_secret_123" }), true);
    assert.equal(service.verifyWebhookAuth({}, "test_secret_123"), true);

    // 6. Invalid secret or missing signature
    assert.equal(service.verifyWebhookAuth({ "x-webhook-secret": "wrong" }), false);
    assert.equal(service.verifyWebhookAuth({}), false);
  });

  test("verifyWorkerAuth protects worker sweep and rejects x-vercel-cron alone", () => {
    const service = new SyncService({
      processor: { processArticle: async () => {}, deleteArticle: async () => {} },
      env: { ...mockEnv, CRON_SECRET: "cron_secret_789" },
      tablesDB: {},
    });

    // Valid authorization header
    assert.equal(
      service.verifyWorkerAuth({
        headers: { authorization: "Bearer cron_secret_789" },
      }),
      true
    );

    // Valid dedicated X-Cron-Secret header
    assert.equal(
      service.verifyWorkerAuth({
        headers: { "x-cron-secret": "cron_secret_789" },
      }),
      true
    );

    // X-Vercel-Cron: 1 alone without secret is unauthorized
    assert.equal(
      service.verifyWorkerAuth({
        headers: { "x-vercel-cron": "1" },
      }),
      false
    );

    // Wrong secret is rejected
    assert.equal(
      service.verifyWorkerAuth({
        headers: { authorization: "Bearer wrong_secret" },
      }),
      false
    );
  });

  test("handleWebhookEvent handles TablesDB delete event", async () => {
    let deletedId = null;
    const mockProcessor = {
      deleteArticle: async (id) => {
        deletedId = id;
        return { deleted: true };
      },
      processArticle: async () => {},
    };

    const service = new SyncService({
      processor: mockProcessor,
      env: mockEnv,
      tablesDB: {},
    });

    const result = await service.handleWebhookEvent({
      event: "tablesdb.6a53b1a4002566268803.tables.articles.rows.doc_123.delete",
      payload: { $id: "doc_123" },
    });

    assert.equal(deletedId, "doc_123");
    assert.deepEqual(result, { deleted: true });
  });

  test("handleWebhookEvent handles TablesDB create/update event", async () => {
    let processedDoc = null;
    const mockProcessor = {
      deleteArticle: async () => {},
      processArticle: async (doc) => {
        processedDoc = doc;
        return { action: "indexed", chunksCount: 5 };
      },
    };

    const service = new SyncService({
      processor: mockProcessor,
      env: mockEnv,
      tablesDB: {},
    });

    const result = await service.handleWebhookEvent({
      event: "tablesdb.6a53b1a4002566268803.tables.articles.rows.doc_456.create",
      payload: { $id: "doc_456", title: "New Article", status: "active" },
    });

    assert.equal(processedDoc.$id, "doc_456");
    assert.equal(result.action, "indexed");
    assert.equal(result.chunksCount, 5);
  });

  test("handleWebhookEvent ignores sync_jobs and non-articles table events", async () => {
    let called = false;
    const service = new SyncService({
      processor: {
        processArticle: async () => {
          called = true;
        },
        deleteArticle: async () => {
          called = true;
        },
      },
      env: mockEnv,
      tablesDB: {},
    });

    // 1. sync_jobs by table ID
    const resSyncJobsId = await service.handleWebhookEvent({
      event: "tablesdb.6a53b1a4002566268803.tables.6af2a4b5001496679e4c.rows.job_1.create",
      payload: { $id: "job_1", articleId: "art_1", status: "pending" },
    });
    assert.equal(resSyncJobsId.action, "ignored");
    assert.equal(resSyncJobsId.reason, "ignored_sync_jobs_event");
    assert.equal(called, false);

    // 2. sync_jobs by name
    const resSyncJobsName = await service.handleWebhookEvent({
      event: "tablesdb.6a53b1a4002566268803.tables.sync_jobs.rows.job_2.update",
      payload: { $id: "job_2" },
    });
    assert.equal(resSyncJobsName.action, "ignored");
    assert.equal(resSyncJobsName.reason, "ignored_sync_jobs_event");

    // 3. Another table in the same database
    const resOtherTable = await service.handleWebhookEvent({
      event: "tablesdb.6a53b1a4002566268803.tables.comments.rows.c_1.create",
      payload: { $id: "c_1" },
    });
    assert.equal(resOtherTable.action, "ignored");
    assert.equal(resOtherTable.reason, "non_articles_table");

    // 4. Different database ID
    const resOtherDb = await service.handleWebhookEvent({
      event: "tablesdb.wrong_db.tables.articles.rows.art_1.create",
      payload: { $id: "art_1" },
    });
    assert.equal(resOtherDb.action, "ignored");
    assert.equal(resOtherDb.reason, "database_mismatch");

    // 5. Console-style databases.*.tables.sync_jobs.* ignored
    const resConsoleSyncJobs = await service.handleWebhookEvent({
      event: "databases.6a53b1a4002566268803.tables.sync_jobs.rows.*.create",
      payload: { $id: "job_console_1" },
    });
    assert.equal(resConsoleSyncJobs.action, "ignored");
    assert.equal(resConsoleSyncJobs.reason, "ignored_sync_jobs_event");

    // 6. Console-style databases.*.tables.6af2a4b5001496679e4c.* ignored
    const resConsoleSyncJobsId = await service.handleWebhookEvent({
      event: "databases.6a53b1a4002566268803.tables.6af2a4b5001496679e4c.rows.*.update",
      payload: { $id: "job_console_2" },
    });
    assert.equal(resConsoleSyncJobsId.action, "ignored");
    assert.equal(resConsoleSyncJobsId.reason, "ignored_sync_jobs_event");

    // 7. Console-style wrong DB & unrelated table ignored
    const resConsoleWrongDb = await service.handleWebhookEvent({
      event: "databases.wrong_db.tables.articles.rows.*.create",
      payload: { $id: "art_2" },
    });
    assert.equal(resConsoleWrongDb.action, "ignored");
    assert.equal(resConsoleWrongDb.reason, "database_mismatch");

    const resConsoleUnrelatedTable = await service.handleWebhookEvent({
      event: "databases.6a53b1a4002566268803.tables.unrelated.rows.*.create",
      payload: { $id: "u_1" },
    });
    assert.equal(resConsoleUnrelatedTable.action, "ignored");
    assert.equal(resConsoleUnrelatedTable.reason, "non_articles_table");
    assert.equal(called, false);
  });

  test("handleWebhookEvent supports exact Appwrite Console event strings for create, update, and delete", async () => {
    const actions = [];
    const mockProcessor = {
      processArticle: async (doc) => {
        actions.push({ type: "upsert", id: doc.$id });
        return { action: "indexed", chunksCount: 1 };
      },
      deleteArticle: async (id) => {
        actions.push({ type: "delete", id });
        return { deleted: true };
      },
    };

    const service = new SyncService({
      processor: mockProcessor,
      env: mockEnv,
      tablesDB: {},
    });

    // Exact create event string from Appwrite Console
    const resCreate = await service.handleWebhookEvent({
      event: "databases.6a53b1a4002566268803.tables.articles.rows.*.create",
      payload: { $id: "art_console_1", title: "Created Article", status: "active" },
    });
    assert.equal(resCreate.action, "indexed");

    // Exact update event string from Appwrite Console
    const resUpdate = await service.handleWebhookEvent({
      event: "databases.6a53b1a4002566268803.tables.articles.rows.*.update",
      payload: { $id: "art_console_1", title: "Updated Article", status: "active" },
    });
    assert.equal(resUpdate.action, "indexed");

    // Exact delete event string from Appwrite Console
    const resDelete = await service.handleWebhookEvent({
      event: "databases.6a53b1a4002566268803.tables.articles.rows.*.delete",
      payload: { $id: "art_console_1" },
    });
    assert.equal(resDelete.deleted, true);

    assert.deepEqual(actions, [
      { type: "upsert", id: "art_console_1" },
      { type: "upsert", id: "art_console_1" },
      { type: "delete", id: "art_console_1" },
    ]);
  });

  test("handleWebhookEvent rejects valid article event payload without $id", async () => {
    const service = new SyncService({
      processor: { processArticle: async () => {}, deleteArticle: async () => {} },
      env: mockEnv,
      tablesDB: {},
    });

    await assert.rejects(
      async () =>
        service.handleWebhookEvent({
          event: "tablesdb.6a53b1a4002566268803.tables.articles.rows.*.create",
          payload: {},
        }),
      /row \$id is required/
    );
  });

  test("syncSingleArticle handles action=delete", async () => {
    let deletedId = null;
    const mockProcessor = {
      deleteArticle: async (id) => {
        deletedId = id;
        return { deleted: true };
      },
      processArticle: async () => {},
    };

    const service = new SyncService({
      processor: mockProcessor,
      env: mockEnv,
      tablesDB: {},
    });

    const result = await service.syncSingleArticle("art_del", "delete");
    assert.equal(deletedId, "art_del");
    assert.deepEqual(result, { deleted: true });
  });

  test("syncSingleArticle fetches row from Appwrite TablesDB using getRow on upsert", async () => {
    let fetchedParams = null;

    const mockTablesDB = {
      getRow: async (params) => {
        fetchedParams = params;
        return { $id: params.rowId, title: "Fetched Post", status: "active", content: "<p>Text</p>" };
      },
    };

    let processedDoc = null;
    const mockProcessor = {
      deleteArticle: async () => {},
      processArticle: async (doc) => {
        processedDoc = doc;
        return { action: "indexed", chunksCount: 2 };
      },
    };

    const service = new SyncService({
      processor: mockProcessor,
      env: mockEnv,
      tablesDB: mockTablesDB,
    });

    const result = await service.syncSingleArticle("art_fetch", "upsert");
    assert.deepEqual(fetchedParams, {
      databaseId: "6a53b1a4002566268803",
      tableId: "articles",
      rowId: "art_fetch",
    });
    assert.equal(processedDoc.title, "Fetched Post");
    assert.equal(result.action, "indexed");
  });

  test("syncSingleArticle purges vector if TablesDB returns 404", async () => {
    const mockTablesDB = {
      getRow: async () => {
        const err = new Error("Row could not be found");
        err.code = 404;
        throw err;
      },
    };

    let deletedId = null;
    const mockProcessor = {
      deleteArticle: async (id) => {
        deletedId = id;
        return { deleted: true, reason: "404 not found" };
      },
      processArticle: async () => {},
    };

    const service = new SyncService({
      processor: mockProcessor,
      env: mockEnv,
      tablesDB: mockTablesDB,
    });

    const result = await service.syncSingleArticle("art_missing", "upsert");
    assert.equal(deletedId, "art_missing");
    assert.equal(result.deleted, true);
  });

  test("SyncJobStore calls TablesDB createRow, getRow, updateRow, listRows with sync_jobs table ID", async () => {
    const calls = [];
    const rowsMap = new Map();

    const mockTablesDB = {
      createRow: async (params) => {
        calls.push({ method: "createRow", params });
        const row = { $id: "job_row_1", ...params.data, $createdAt: "2026-11-10T00:00:00Z", $updatedAt: "2026-11-10T00:00:00Z" };
        rowsMap.set(row.$id, row);
        return row;
      },
      getRow: async (params) => {
        calls.push({ method: "getRow", params });
        return rowsMap.get(params.rowId);
      },
      updateRow: async (params) => {
        calls.push({ method: "updateRow", params });
        const existing = rowsMap.get(params.rowId);
        const updated = { ...existing, ...params.data };
        rowsMap.set(params.rowId, updated);
        return updated;
      },
      listRows: async (params) => {
        calls.push({ method: "listRows", params });
        const all = Array.from(rowsMap.values());
        return { total: all.length, rows: all };
      },
    };

    const store = new SyncJobStore({
      tablesDB: mockTablesDB,
      databaseId: "6a53b1a4002566268803",
      tableId: "6af2a4b5001496679e4c",
      nodeEnv: "production",
    });

    // 1. createRow
    const created = await store.createJob({
      articleId: "art_1",
      action: "upsert",
      event: "tablesdb.6a53b1a4002566268803.tables.articles.rows.art_1.create",
      contentHash: "hash123",
    });
    assert.equal(created.$id, "job_row_1");
    assert.equal(calls[0].method, "createRow");
    assert.equal(calls[0].params.databaseId, "6a53b1a4002566268803");
    assert.equal(calls[0].params.tableId, "6af2a4b5001496679e4c");

    // 2. listRows (reads response.rows)
    const due = await store.findDueJobs(5);
    assert.equal(due.length, 1);
    assert.equal(due[0].$id, "job_row_1");
    assert.equal(calls[1].method, "listRows");
    assert.equal(calls[1].params.tableId, "6af2a4b5001496679e4c");

    // 3. getRow + updateRow on acquireLease
    const leased = await store.acquireLease("job_row_1", 60000);
    assert.equal(leased.status, "processing");
    assert.equal(leased.attempts, 1);
    assert.ok(calls.some((c) => c.method === "getRow" && c.params.rowId === "job_row_1"));
    assert.ok(calls.some((c) => c.method === "updateRow" && c.params.rowId === "job_row_1"));

    // 4. markCompleted -> updateRow
    const completed = await store.markCompleted("job_row_1");
    assert.equal(completed.status, "completed");

    // 5. getJobStats -> listRows (reads response.rows)
    const stats = await store.getJobStats();
    assert.equal(stats.metrics.completed, 1);
    assert.equal(stats.recentJobs[0].jobId, "job_row_1");
  });
});

