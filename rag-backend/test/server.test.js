import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server.js";

describe("HTTP Server Endpoint Tests", () => {
  const mockRagService = {
    ask: async ({ question }) => {
      if (!question || question.trim().length < 3) {
        const error = new Error("Validation Error");
        error.name = "ZodError";
        error.issues = [{ message: "Question must be at least 3 characters long" }];
        throw error;
      }
      return {
        answer: "This is a mock answer about StoryNest.",
        sources: [
          {
            articleId: "art_test",
            title: "Test Article",
            slug: "test-article",
            category: "General",
            relevantChunks: [{ chunkIndex: 0, text: "Snippet" }],
          },
        ],
        insufficientContext: false,
      };
    },
  };

  const mockSyncService = {
    verifyWebhookAuth: (headers = {}, querySecret = "") => {
      const secret = headers["x-webhook-secret"] || querySecret;
      return secret === "correct_secret";
    },
    handleWebhookEvent: async ({ event, payload }) => {
      return { eventHandled: event, articleId: payload.$id };
    },
    syncSingleArticle: async (articleId, action) => {
      return { syncedArticleId: articleId, action };
    },
  };

  const mockEnv = {
    PORT: 0, // OS assigns random available port
    CORS_ORIGIN: "http://localhost:5173",
    RATE_LIMIT_MAX_REQUESTS: 3,
    RATE_LIMIT_WINDOW_MS: 10000,
    OPENROUTER_CHAT_MODEL: "openai/gpt-4o-mini",
    QDRANT_COLLECTION_NAME: "storynest",
    WEBHOOK_SECRET: "correct_secret",
  };

  test("GET /api/health returns 200 and status ok", async () => {
    const server = createServer({
      env: mockEnv,
      ragQueryService: mockRagService,
      syncService: mockSyncService,
    });
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, "ok");
    assert.equal(data.service, "ask-storynest-rag");
    assert.equal(data.model, "openai/gpt-4o-mini");

    server.close();
  });

  test("OPTIONS /api/ask handles CORS preflight with 204", async () => {
    const server = createServer({
      env: mockEnv,
      ragQueryService: mockRagService,
      syncService: mockSyncService,
    });
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/api/ask`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
      },
    });

    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:5173");
    assert.ok(res.headers.get("access-control-allow-methods")?.includes("POST"));

    server.close();
  });

  test("POST /api/ask returns answer and sources for valid question", async () => {
    const server = createServer({
      env: mockEnv,
      ragQueryService: mockRagService,
      syncService: mockSyncService,
    });
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "How does StoryNest work?" }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.answer, "This is a mock answer about StoryNest.");
    assert.equal(data.sources.length, 1);
    assert.equal(data.sources[0].title, "Test Article");
    assert.equal(data.insufficientContext, false);

    server.close();
  });

  test("POST /api/ask rejects empty or short question with 400", async () => {
    const server = createServer({
      env: mockEnv,
      ragQueryService: mockRagService,
      syncService: mockSyncService,
    });
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "  " }),
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, "Validation Error");

    server.close();
  });

  test("POST /api/ask enforces rate limiting", async () => {
    const lowRateLimitEnv = {
      ...mockEnv,
      RATE_LIMIT_MAX_REQUESTS: 2,
    };
    const server = createServer({
      env: lowRateLimitEnv,
      ragQueryService: mockRagService,
      syncService: mockSyncService,
    });
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    // First request - ok
    const res1 = await fetch(`http://127.0.0.1:${port}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "Question 1" }),
    });
    assert.equal(res1.status, 200);

    // Second request - ok
    const res2 = await fetch(`http://127.0.0.1:${port}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "Question 2" }),
    });
    assert.equal(res2.status, 200);

    // Third request - rate limited (429)
    const res3 = await fetch(`http://127.0.0.1:${port}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "Question 3" }),
    });
    assert.equal(res3.status, 429);
    const data = await res3.json();
    assert.equal(data.error, "Too Many Requests");

    server.close();
  });

  test("POST /api/webhooks/appwrite rejects unauthenticated requests", async () => {
    const server = createServer({
      env: mockEnv,
      ragQueryService: mockRagService,
      syncService: mockSyncService,
    });
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/api/webhooks/appwrite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: { $id: "doc_1" } }),
    });

    assert.equal(res.status, 401);
    server.close();
  });

  test("POST /api/webhooks/appwrite accepts authenticated webhook", async () => {
    const server = createServer({
      env: mockEnv,
      ragQueryService: mockRagService,
      syncService: mockSyncService,
    });
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/api/webhooks/appwrite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": "correct_secret",
        "X-Appwrite-Webhook-Event": "databases.db.collections.col.documents.doc_1.create",
      },
      body: JSON.stringify({ $id: "doc_1", title: "New Story" }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.result.articleId, "doc_1");
    server.close();
  });

  test("POST /api/articles/sync-single processes authenticated single sync", async () => {
    const server = createServer({
      env: mockEnv,
      ragQueryService: mockRagService,
      syncService: mockSyncService,
    });
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/api/articles/sync-single?secret=correct_secret`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId: "art_99", action: "upsert" }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.result.syncedArticleId, "art_99");
    server.close();
  });
});
