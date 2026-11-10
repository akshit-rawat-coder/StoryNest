import { test, describe } from "node:test";
import assert from "node:assert/strict";
import defaultHandler, { createRequestHandler } from "../index.js";

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
        "x-appwrite-webhook-event": "databases.db.collections.col.documents.doc_99.create",
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
});

