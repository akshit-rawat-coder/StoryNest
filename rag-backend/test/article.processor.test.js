import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ArticleProcessor } from "../pipeline/article.processor.js";

describe("Article Processor Lifecycle", () => {
  test("indexes an active published article", async () => {
    let deletedId = null;
    let upsertedPoints = [];

    const mockVectorStore = {
      deleteByArticleId: async (id) => {
        deletedId = id;
      },
      upsertPoints: async (points) => {
        upsertedPoints = points;
        return { status: "completed", count: points.length };
      },
    };

    const mockEmbeddingProvider = {
      embedBatch: async (texts) => texts.map(() => [0.1, 0.2, 0.3]),
    };

    const processor = new ArticleProcessor({
      vectorStore: mockVectorStore,
      embeddingProvider: mockEmbeddingProvider,
    });

    const activeArticle = {
      $id: "art_publish_1",
      title: "Building RAG with StoryNest",
      content: "<p>This is paragraph one.</p><p>This is paragraph two with details.</p>",
      slug: "building-rag-with-storynest",
      status: "active",
      category: "AI",
      tags: ["rag", "ai"],
      authorUsername: "akshit",
    };

    const result = await processor.processArticle(activeArticle);

    assert.equal(result.action, "indexed");
    assert.equal(result.articleId, "art_publish_1");
    assert.equal(deletedId, "art_publish_1", "Must delete old chunks before upserting for idempotency");
    assert.ok(upsertedPoints.length > 0);
    assert.equal(upsertedPoints[0].payload.title, "Building RAG with StoryNest");
    assert.equal(upsertedPoints[0].payload.status, "active");
    assert.equal(upsertedPoints[0].payload.category, "AI");
  });

  test("purges inactive or draft articles from vector store", async () => {
    let deletedId = null;
    let upsertCalled = false;

    const mockVectorStore = {
      deleteByArticleId: async (id) => {
        deletedId = id;
      },
      upsertPoints: async () => {
        upsertCalled = true;
      },
    };

    const mockEmbeddingProvider = {
      embedBatch: async () => [],
    };

    const processor = new ArticleProcessor({
      vectorStore: mockVectorStore,
      embeddingProvider: mockEmbeddingProvider,
    });

    const draftArticle = {
      $id: "art_draft_99",
      title: "Unpublished Draft Idea",
      content: "<p>Work in progress notes...</p>",
      status: "inactive",
    };

    const result = await processor.processArticle(draftArticle);

    assert.equal(result.action, "deleted");
    assert.equal(result.reason, "inactive_or_draft");
    assert.equal(deletedId, "art_draft_99");
    assert.equal(upsertCalled, false, "Must not upsert inactive articles");
  });
});

