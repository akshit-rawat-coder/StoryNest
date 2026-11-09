import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { VectorStore, generatePointId } from "../vector/vector.store.js";

describe("Vector Store & Point ID Generation", () => {
  test("generates deterministic and valid UUID format", () => {
    const id1 = generatePointId("article_abc", 0);
    const id2 = generatePointId("article_abc", 0);
    const id3 = generatePointId("article_abc", 1);

    assert.equal(id1, id2, "Point ID must be deterministic");
    assert.notEqual(id1, id3, "Point IDs for different chunk indexes must differ");

    // Standard UUID regex
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    assert.ok(uuidRegex.test(id1), `Expected valid UUID string, got ${id1}`);
  });

  test("VectorStore calls client upsert with correct collection name", async () => {
    let capturedCollection = "";
    let capturedPoints = [];

    const mockClient = {
      upsert: async (col, data) => {
        capturedCollection = col;
        capturedPoints = data.points;
        return { status: "completed" };
      },
    };

    const store = new VectorStore({ client: mockClient, collectionName: "test_articles" });
    const points = [
      { id: "uuid-1", vector: [0.1, 0.2], payload: { articleId: "art_1", status: "active" } },
    ];

    const result = await store.upsertPoints(points);
    assert.equal(result.status, "completed");
    assert.equal(capturedCollection, "test_articles");
    assert.equal(capturedPoints.length, 1);
  });

  test("VectorStore deletes by articleId with payload filter", async () => {
    let capturedDeleteFilter = null;

    const mockClient = {
      delete: async (col, data) => {
        capturedDeleteFilter = data.filter;
        return { status: "completed" };
      },
    };

    const store = new VectorStore({ client: mockClient, collectionName: "test_articles" });
    await store.deleteByArticleId("target_article_123");

    assert.ok(capturedDeleteFilter);
    assert.deepEqual(capturedDeleteFilter.must[0], {
      key: "articleId",
      match: { value: "target_article_123" },
    });
  });

  test("VectorStore search enforces active status filter", async () => {
    let capturedSearchParams = null;

    const mockClient = {
      search: async (col, params) => {
        capturedSearchParams = params;
        return [
          { id: "p1", score: 0.95, payload: { title: "Found Article", status: "active" } },
        ];
      },
    };

    const store = new VectorStore({ client: mockClient, collectionName: "test_articles" });
    const results = await store.search({ vector: [0.1, 0.2], limit: 3 });

    assert.equal(results.length, 1);
    assert.equal(results[0].score, 0.95);
    // Verify that status: "active" filter was applied
    const statusClause = capturedSearchParams.filter.must.find((c) => c.key === "status");
    assert.ok(statusClause, "Must filter by status");
    assert.equal(statusClause.match.value, "active");
  });
});

