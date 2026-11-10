import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { SyncService } from "../services/sync.service.js";

describe("SyncService Unit Tests", () => {
  const mockEnv = {
    WEBHOOK_SECRET: "test_secret_123",
    APPWRITE_DATABASE_ID: "test_db",
    APPWRITE_COLLECTION_ID: "test_articles",
    APPWRITE_ENDPOINT: "https://cloud.appwrite.io/v1",
    APPWRITE_PROJECT_ID: "test_project",
    APPWRITE_API_KEY: "test_key",
  };

  test("verifyWebhookAuth validates HMAC-SHA1 signature and custom secret headers", () => {
    const service = new SyncService({
      processor: { processArticle: async () => {}, deleteArticle: async () => {} },
      env: mockEnv,
      databases: {},
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
      databases: {},
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

  test("handleWebhookEvent handles delete event", async () => {
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
      databases: {},
    });

    const result = await service.handleWebhookEvent({
      event: "databases.test_db.collections.test_articles.documents.doc_123.delete",
      payload: { $id: "doc_123" },
    });

    assert.equal(deletedId, "doc_123");
    assert.deepEqual(result, { deleted: true });
  });

  test("handleWebhookEvent handles create/update event", async () => {
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
      databases: {},
    });

    const result = await service.handleWebhookEvent({
      event: "databases.test_db.collections.test_articles.documents.doc_456.create",
      payload: { $id: "doc_456", title: "New Article", status: "active" },
    });

    assert.equal(processedDoc.$id, "doc_456");
    assert.equal(result.action, "indexed");
    assert.equal(result.chunksCount, 5);
  });

  test("handleWebhookEvent rejects payload without $id", async () => {
    const service = new SyncService({
      processor: { processArticle: async () => {}, deleteArticle: async () => {} },
      env: mockEnv,
      databases: {},
    });

    await assert.rejects(
      async () => service.handleWebhookEvent({ event: "create", payload: {} }),
      /document \$id is required/
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
      databases: {},
    });

    const result = await service.syncSingleArticle("art_del", "delete");
    assert.equal(deletedId, "art_del");
    assert.deepEqual(result, { deleted: true });
  });

  test("syncSingleArticle fetches document from Appwrite on upsert", async () => {
    let fetchedDatabaseId = null;
    let fetchedCollectionId = null;
    let fetchedDocId = null;

    const mockDatabases = {
      getDocument: async (dbId, colId, docId) => {
        fetchedDatabaseId = dbId;
        fetchedCollectionId = colId;
        fetchedDocId = docId;
        return { $id: docId, title: "Fetched Post", status: "active", content: "<p>Text</p>" };
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
      databases: mockDatabases,
    });

    const result = await service.syncSingleArticle("art_fetch", "upsert");
    assert.equal(fetchedDatabaseId, "test_db");
    assert.equal(fetchedCollectionId, "test_articles");
    assert.equal(fetchedDocId, "art_fetch");
    assert.equal(processedDoc.title, "Fetched Post");
    assert.equal(result.action, "indexed");
  });

  test("syncSingleArticle purges vector if Appwrite returns 404", async () => {
    const mockDatabases = {
      getDocument: async () => {
        const err = new Error("Document not found");
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
      databases: mockDatabases,
    });

    const result = await service.syncSingleArticle("art_missing", "upsert");
    assert.equal(deletedId, "art_missing");
    assert.equal(result.deleted, true);
  });
});

