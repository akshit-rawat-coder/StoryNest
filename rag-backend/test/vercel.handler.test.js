import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import defaultHandler, { createRequestHandler, SyncService } from "../index.js";
import { SyncJobStore } from "../services/job.store.js";

describe("Vercel Serverless Handler Adapter Tests", () => {
  const mockRagService = {
    ask: async ({ question, mode, contextArticleId }) => {
      return {
        answer: "StoryNest is a blogging platform built with React and Appwrite.",
        sources: [
          {
            articleId: contextArticleId || "art_1",
            title: "StoryNest Overview",
            slug: "storynest-overview",
            category: "Tech",
            relevantChunks: [{ chunkIndex: 0, text: "Sample text" }],
          },
        ],
        insufficientContext: false,
        mode: mode || "all",
        contextArticleId: contextArticleId || null,
      };
    },
  };

  const mockSyncService = {
    verifyWebhookAuth: (firstArg = {}) => {
      const headers = firstArg.headers || firstArg;
      return headers["x-webhook-secret"] === "secret_123" || headers["authorization"] === "Bearer secret_123";
    },
    verifyWorkerAuth: ({ headers = {}, querySecret = "" } = {}) => {
      const auth = (headers["authorization"] || "").replace(/^Bearer\s+/i, "");
      const cronSec = headers["x-cron-secret"] || "";
      const secret = auth || cronSec || querySecret;
      return secret === "cron_secret_123" || secret === "secret_123";
    },
    handleWebhookEvent: async ({ payload }) => ({ indexed: payload.$id }),
    syncSingleArticle: async (id, action) => ({ synced: id, action }),
    drainQueue: async () => ({ processed: 2, successes: 2, failures: 0 }),
    reconcile: async () => ({ activeDocs: 5, missingIndexed: 1 }),
    jobStore: {
      getJobStats: async () => ({
        metrics: { pending: 0, processing: 0, completed: 5, failed: 0 },
        recentJobs: [],
      }),
    },
  };

  const mockEnv = {
    PORT: 3001,
    CORS_ORIGIN: "*",
    RATE_LIMIT_MAX_REQUESTS: 20,
    RATE_LIMIT_WINDOW_MS: 60000,
    OPENROUTER_CHAT_MODEL: "openai/gpt-4o-mini",
    QDRANT_COLLECTION_NAME: "storynest",
    WEBHOOK_SECRET: "secret_123",
    CRON_SECRET: "cron_secret_123",
  };

  // Mock response builder
  function createMockResponse() {
    const res = {
      statusCode: 200,
      headers: {},
      body: "",
      setHeader(name, val) {
        this.headers[name.toLowerCase()] = val;
      },
      writeHead(code, headers = {}) {
        this.statusCode = code;
        for (const [k, v] of Object.entries(headers)) {
          this.setHeader(k, v);
        }
      },
      end(data) {
        this.body = data || "";
      },
    };
    return res;
  }

  test("handles GET /api/health with 200 status", async () => {
    const handler = createRequestHandler({
      env: mockEnv,
      ragQueryService: mockRagService,
      syncService: mockSyncService,
    });

    const req = {
      method: "GET",
      url: "/api/health",
      headers: { host: "storynest-rag.vercel.app" },
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.status, "ok");
    assert.equal(json.service, "ask-storynest-rag");
  });

  test("handles root / path as health check (Vercel rewrite friendly)", async () => {
    const handler = createRequestHandler({
      env: mockEnv,
      ragQueryService: mockRagService,
      syncService: mockSyncService,
    });

    const req = {
      method: "GET",
      url: "/",
      headers: { host: "storynest-rag.vercel.app" },
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.status, "ok");
  });

  test("handles POST /api/ask with pre-parsed Vercel body object", async () => {
    const handler = createRequestHandler({
      env: mockEnv,
      ragQueryService: mockRagService,
      syncService: mockSyncService,
    });

    const req = {
      method: "POST",
      url: "/api/ask",
      headers: { host: "storynest-rag.vercel.app" },
      body: { question: "What is StoryNest?", mode: "all" }, // Pre-parsed by Vercel
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.ok(json.answer.includes("StoryNest is a blogging platform"));
    assert.equal(json.mode, "all");
    assert.equal(json.sources.length, 1);
  });

  test("default export of index.js is a valid function for Vercel runtime", () => {
    assert.equal(typeof defaultHandler, "function");
  });

  test("handles /favicon.ico with 204 status", async () => {
    const handler = createRequestHandler({
      env: mockEnv,
      ragQueryService: mockRagService,
      syncService: mockSyncService,
    });

    const req = {
      method: "GET",
      url: "/favicon.ico",
      headers: { host: "storynest-rag.vercel.app" },
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.equal(res.statusCode, 204);
  });

  test("handles POST /api/webhooks/appwrite with pre-parsed Vercel body", async () => {
    const handler = createRequestHandler({
      env: mockEnv,
      ragQueryService: mockRagService,
      syncService: mockSyncService,
    });

    const req = {
      method: "POST",
      url: "/api/webhooks/appwrite",
      headers: {
        host: "storynest-rag.vercel.app",
        "x-webhook-secret": "secret_123",
        "x-appwrite-webhook-event": "tablesdb.6a53b1a4002566268803.tables.articles.rows.doc_99.create",
      },
      body: { $id: "doc_99", title: "New Doc" },
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.success, true);
    assert.equal(json.result.indexed, "doc_99");
  });

  test("handles Vercel rewrite URL with path query parameter (?path=api/ask)", async () => {
    const handler = createRequestHandler({
      env: mockEnv,
      ragQueryService: mockRagService,
      syncService: mockSyncService,
    });

    const req = {
      method: "POST",
      url: "/index.js?path=api/ask",
      headers: { host: "storynest-rag.vercel.app" },
      body: { question: "What is StoryNest?", mode: "all" },
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.ok(json.answer);
  });

  test("handles Vercel rewrite URL using x-matched-path header", async () => {
    const handler = createRequestHandler({
      env: mockEnv,
      ragQueryService: mockRagService,
      syncService: mockSyncService,
    });

    const req = {
      method: "GET",
      url: "/index.js",
      headers: {
        host: "storynest-rag.vercel.app",
        "x-matched-path": "/api/health",
      },
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.status, "ok");
  });

  test("enforces CORS for production domain and rejects arbitrary domains", async () => {
    const handler = createRequestHandler({
      env: { ...mockEnv, CORS_ORIGIN: "http://localhost:5173" },
      ragQueryService: mockRagService,
      syncService: mockSyncService,
    });

    // Allowed production origin
    const reqAllowed = {
      method: "OPTIONS",
      url: "/api/ask",
      headers: {
        host: "storynest-rag.vercel.app",
        origin: "https://story-nest-theta.vercel.app",
      },
    };
    const resAllowed = createMockResponse();
    await handler(reqAllowed, resAllowed);

    assert.equal(resAllowed.statusCode, 204);
    assert.equal(
      resAllowed.headers["access-control-allow-origin"],
      "https://story-nest-theta.vercel.app"
    );

    // Arbitrary origin rejection (falls back to configured CORS_ORIGIN)
    const reqRejected = {
      method: "OPTIONS",
      url: "/api/ask",
      headers: {
        host: "storynest-rag.vercel.app",
        origin: "https://arbitrary-attacker.vercel.app",
      },
    };
    const resRejected = createMockResponse();
    await handler(reqRejected, resRejected);

    assert.equal(resRejected.statusCode, 204);
    assert.equal(
      resRejected.headers["access-control-allow-origin"],
      "http://localhost:5173"
    );
  });

  test("handles GET /api/jobs/worker when authenticated with Bearer CRON_SECRET", async () => {
    const handler = createRequestHandler({
      env: mockEnv,
      ragQueryService: mockRagService,
      syncService: mockSyncService,
    });

    const req = {
      method: "GET",
      url: "/api/jobs/worker",
      headers: {
        host: "storynest-rag.vercel.app",
        authorization: "Bearer cron_secret_123",
      },
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.success, true);
    assert.equal(json.processed, 2);
  });

  test("rejects GET /api/jobs/worker when unauthenticated even if x-vercel-cron header is present", async () => {
    const handler = createRequestHandler({
      env: mockEnv,
      ragQueryService: mockRagService,
      syncService: mockSyncService,
    });

    const req = {
      method: "GET",
      url: "/api/jobs/worker",
      headers: {
        host: "storynest-rag.vercel.app",
        "x-vercel-cron": "1", // Spoofed or header without valid CRON_SECRET
      },
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.equal(res.statusCode, 401);
    const json = JSON.parse(res.body);
    assert.equal(json.error, "Unauthorized");
    assert.equal(json.message, "Invalid worker authorization");
  });

  test("handles GET /api/jobs/status returning job metrics safely", async () => {
    const handler = createRequestHandler({
      env: mockEnv,
      ragQueryService: mockRagService,
      syncService: mockSyncService,
    });

    const req = {
      method: "GET",
      url: "/api/jobs/status",
      headers: { host: "storynest-rag.vercel.app" },
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.status, "ok");
    assert.equal(json.metrics.completed, 5);
  });

  test("handles POST /api/sync/reconcile with webhook authentication", async () => {
    const handler = createRequestHandler({
      env: mockEnv,
      ragQueryService: mockRagService,
      syncService: mockSyncService,
    });

    const req = {
      method: "POST",
      url: "/api/sync/reconcile",
      headers: {
        host: "storynest-rag.vercel.app",
        "x-webhook-secret": "secret_123",
      },
      body: { dryRun: false },
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.success, true);
    assert.equal(json.missingIndexed, 1);
  });

  test("REGRESSION: verifies Appwrite HMAC-SHA1 behind Vercel rewrite (?path=) and creates sync_jobs row", async () => {
    const createdJobRows = [];
    const jobRowsMap = new Map();
    const realMockTablesDB = {
      createRow: async ({ databaseId, tableId, rowId, data }) => {
        const row = { $id: rowId === "unique()" ? "job_vercel_1" : rowId, ...data };
        createdJobRows.push({ databaseId, tableId, row });
        jobRowsMap.set(row.$id, row);
        return row;
      },
      getRow: async ({ tableId, rowId }) => {
        if (tableId === "6af2a4b5001496679e4c") {
          return jobRowsMap.get(rowId);
        }
        return {
          $id: rowId,
          title: "Vercel‑Rewrite UTF‑8 Article",
          status: "active",
          content: "<p>RAG synchronization test.</p>",
          $updatedAt: "2026-11-10T12:00:00.000Z",
        };
      },
      updateRow: async ({ rowId, data }) => {
        const updated = { ...(jobRowsMap.get(rowId) || {}), ...data };
        jobRowsMap.set(rowId, updated);
        return updated;
      },
    };

    const realEnv = {
      ...mockEnv,
      APPWRITE_DATABASE_ID: "6a53b1a4002566268803",
      APPWRITE_TABLE_ID: "articles",
      APPWRITE_SYNC_JOBS_TABLE_ID: "6af2a4b5001496679e4c",
      WEBHOOK_SECRET: "vercel_signing_key_abc",
    };

    const jobStore = new SyncJobStore({
      tablesDB: realMockTablesDB,
      databaseId: realEnv.APPWRITE_DATABASE_ID,
      tableId: realEnv.APPWRITE_SYNC_JOBS_TABLE_ID,
      nodeEnv: "production",
    });

    const mockProcessor = {
      vectorStore: { getArticleMetadata: async () => null },
      processArticle: async (doc) => ({ action: "indexed", chunksCount: 1, vectorsCount: 1, title: doc.title }),
      deleteArticle: async () => ({ deleted: true }),
    };

    const realSyncService = new SyncService({
      processor: mockProcessor,
      env: realEnv,
      jobStore,
      tablesDB: realMockTablesDB,
    });

    const handler = createRequestHandler({
      env: realEnv,
      ragQueryService: mockRagService,
      syncService: realSyncService,
    });

    // PHP-style raw JSON with escaped forward slashes + multi-byte UTF-8 non-breaking hyphen (‑)
    const rawPayloadString =
      '{"$id":"art_vercel_1","title":"Vercel\\u2011Rewrite UTF\\u20118 Article","status":"active","content":"<p>RAG<\\/p>","$updatedAt":"2026-11-10T12:00:00.000Z"}';
    const rawBuf = Buffer.from(rawPayloadString, "utf8");

    // Appwrite computes HMAC-SHA1 against the public webhook URL (NO /index.js and NO ?path=)
    const publicWebhookUrl = "https://rag-backend-zeta.vercel.app/api/webhooks/appwrite";
    const appwriteSignature = crypto
      .createHmac("sha1", realEnv.WEBHOOK_SECRET)
      .update(publicWebhookUrl + rawPayloadString)
      .digest("base64");

    // Split raw buffer across chunks to test multi-byte streaming integrity
    const splitPoint = Math.floor(rawBuf.length / 2);
    const reqStream = Readable.from([rawBuf.subarray(0, splitPoint), rawBuf.subarray(splitPoint)]);
    reqStream.method = "POST";
    reqStream.url = "/index.js?path=api/webhooks/appwrite";
    reqStream.headers = {
      host: "rag-backend-zeta.vercel.app",
      "x-forwarded-proto": "https",
      "content-type": "application/json",
      "content-length": String(rawBuf.length),
      "x-appwrite-webhook-signature": appwriteSignature,
      "x-appwrite-webhook-events":
        "databases.6a53b1a4002566268803.tables.articles.rows.art_vercel_1.create,databases.6a53b1a4002566268803.tables.articles.rows.*.create",
    };

    const res = createMockResponse();
    await handler(reqStream, res);

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.success, true);
    assert.equal(json.result.action, "upsert");
    assert.equal(createdJobRows.length, 1);
    assert.equal(createdJobRows[0].tableId, "6af2a4b5001496679e4c");
    assert.equal(createdJobRows[0].row.articleId, "art_vercel_1");
    assert.equal(
      createdJobRows[0].row.event,
      "databases.6a53b1a4002566268803.tables.articles.rows.art_vercel_1.create"
    );

    // Also test plural X-Appwrite-Webhook-Events with a DELETE event
    const deleteRaw = '{"$id":"art_vercel_1"}';
    const deleteSig = crypto
      .createHmac("sha1", realEnv.WEBHOOK_SECRET)
      .update(publicWebhookUrl + deleteRaw)
      .digest("base64");

    const delStream = Readable.from([Buffer.from(deleteRaw, "utf8")]);
    delStream.method = "POST";
    delStream.url = "/index.js?path=api/webhooks/appwrite";
    delStream.headers = {
      host: "rag-backend-zeta.vercel.app",
      "x-forwarded-proto": "https",
      "content-type": "application/json",
      "x-appwrite-webhook-signature": deleteSig,
      "x-appwrite-webhook-events":
        "databases.6a53b1a4002566268803.tables.articles.rows.art_vercel_1.delete,databases.*.tables.*.rows.*.delete",
    };

    const delRes = createMockResponse();
    await handler(delStream, delRes);

    assert.equal(delRes.statusCode, 200);
    const delJson = JSON.parse(delRes.body);
    assert.equal(delJson.result.action, "delete");
    assert.equal(createdJobRows.length, 2);
    assert.equal(createdJobRows[1].row.action, "delete");
  });
});

