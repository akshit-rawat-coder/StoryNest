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
    verifyWebhookAuth: (headers = {}) => headers["x-webhook-secret"] === "secret_123",
    handleWebhookEvent: async ({ payload }) => ({ indexed: payload.$id }),
    syncSingleArticle: async (id, action) => ({ synced: id, action }),
  };

  const mockEnv = {
    PORT: 3001,
    CORS_ORIGIN: "*",
    RATE_LIMIT_MAX_REQUESTS: 20,
    RATE_LIMIT_WINDOW_MS: 60000,
    OPENROUTER_CHAT_MODEL: "openai/gpt-4o-mini",
    QDRANT_COLLECTION_NAME: "storynest",
    WEBHOOK_SECRET: "secret_123",
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
});

