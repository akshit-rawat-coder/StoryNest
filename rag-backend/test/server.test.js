import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createServer } from "../server.js";
import { OpenRouterChatService } from "../services/chat.service.js";

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
    verifyWebhookAuth: (firstArg = {}, maybeQuery = "") => {
      const headers = firstArg.headers || firstArg;
      const query = firstArg.querySecret || maybeQuery;
      const rawBody = firstArg.rawBody || "";
      const requestUrl = firstArg.requestUrl || "";

      const appwriteSig = headers["x-appwrite-webhook-signature"];
      if (appwriteSig) {
        if (appwriteSig === "correct_secret") return false;
        const expected = crypto
          .createHmac("sha1", "correct_secret")
          .update(requestUrl + rawBody)
          .digest("base64");
        return appwriteSig === expected;
      }

      const secret = headers["x-webhook-secret"] || query;
      return secret === "correct_secret";
    },
    verifyWorkerAuth: ({ headers = {}, querySecret = "" } = {}) => {
      const auth = (headers["authorization"] || "").replace(/^Bearer\s+/i, "");
      const cronSec = headers["x-cron-secret"] || "";
      const secret = auth || cronSec || querySecret;
      return secret === "correct_secret";
    },
    drainQueue: async () => ({ processed: 1, successes: 1, failures: 0 }),
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

  test("POST /api/ask returns a friendly 503 for insufficient OpenRouter credits", async () => {
    const chatService = new OpenRouterChatService({
      apiKey: "test-key",
      fetchFn: async () => ({
        ok: false,
        status: 402,
        text: async () => "provider response must not be returned",
      }),
    });
    const server = createServer({
      env: mockEnv,
      ragQueryService: {
        ask: async () => chatService.generateAnswer({
          question: "Explain edge computing",
          chunks: [{ title: "Test", category: "Tech", chunkText: "Edge processing." }],
        }),
      },
      syncService: mockSyncService,
    });
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    const response = await fetch(`http://127.0.0.1:${port}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "Explain edge computing" }),
    });
    const data = await response.json();

    assert.equal(response.status, 503);
    assert.equal(data.error, "AI service unavailable");
    assert.match(data.message, /insufficient available credits/i);
    assert.doesNotMatch(JSON.stringify(data), /provider response must not be returned/i);

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
        "X-Appwrite-Webhook-Event": "tablesdb.6a53b1a4002566268803.tables.articles.rows.doc_1.create",
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

  test("POST /api/webhooks/appwrite verifies HMAC-SHA1 signature and rejects modified body", async () => {
    const server = createServer({
      env: mockEnv,
      ragQueryService: mockRagService,
      syncService: mockSyncService,
    });
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    const fullUrl = `https://127.0.0.1:${port}/api/webhooks/appwrite`;
    // Raw body with non-compact whitespace to ensure raw body is NOT re-serialized before HMAC check
    const payloadBody = '{ "$id": "doc_sig_1",   "title": "Valid Signature" }';
    const validSignature = crypto
      .createHmac("sha1", "correct_secret")
      .update(fullUrl + payloadBody)
      .digest("base64");

    // 1. Valid signature with exact Appwrite Console event -> 200
    const resValid = await fetch(`http://127.0.0.1:${port}/api/webhooks/appwrite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Appwrite-Webhook-Signature": validSignature,
        "X-Appwrite-Webhook-Event": "databases.6a53b1a4002566268803.tables.articles.rows.*.update",
        "X-Forwarded-Proto": "https",
      },
      body: payloadBody,
    });
    assert.equal(resValid.status, 200);
    const validData = await resValid.json();
    assert.equal(
      validData.result.eventHandled,
      "databases.6a53b1a4002566268803.tables.articles.rows.*.update"
    );

    // 2. Tampered body with original signature -> 401
    const resTampered = await fetch(`http://127.0.0.1:${port}/api/webhooks/appwrite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Appwrite-Webhook-Signature": validSignature,
        "X-Forwarded-Proto": "https",
      },
      body: JSON.stringify({ $id: "doc_sig_1", title: "Tampered Body" }),
    });
    assert.equal(resTampered.status, 401);

    // 3. Direct secret sent in signature header -> rejected with 401
    const resDirectSecret = await fetch(`http://127.0.0.1:${port}/api/webhooks/appwrite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Appwrite-Webhook-Signature": "correct_secret",
        "X-Forwarded-Proto": "https",
      },
      body: payloadBody,
    });
    assert.equal(resDirectSecret.status, 401);

    server.close();
  });

  test("GET /api/jobs/worker rejects request with x-vercel-cron: 1 alone and requires CRON_SECRET", async () => {
    const server = createServer({
      env: mockEnv,
      ragQueryService: mockRagService,
      syncService: mockSyncService,
    });
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    // x-vercel-cron: 1 alone -> 401 Unauthorized
    const resUnauthorized = await fetch(`http://127.0.0.1:${port}/api/jobs/worker`, {
      method: "GET",
      headers: {
        "X-Vercel-Cron": "1",
      },
    });
    assert.equal(resUnauthorized.status, 401);

    // With Authorization: Bearer correct_secret -> 200
    const resAuthorized = await fetch(`http://127.0.0.1:${port}/api/jobs/worker`, {
      method: "GET",
      headers: {
        Authorization: "Bearer correct_secret",
      },
    });
    assert.equal(resAuthorized.status, 200);
    const data = await resAuthorized.json();
    assert.equal(data.success, true);

    server.close();
  });
});
