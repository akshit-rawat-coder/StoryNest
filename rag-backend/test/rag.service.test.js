import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { RagQueryService } from "../services/rag.service.js";

describe("RagQueryService Unit Tests (Mocked Providers)", () => {
  const sampleVector = new Array(1536).fill(0.1);

  // 1. Relevant context produces an answer and source metadata
  test("relevant context produces grounded answer and source metadata", async () => {
    const mockEmbeddingProvider = {
      embedQuery: async () => sampleVector,
    };

    const mockVectorStore = {
      search: async () => [
        {
          id: "chunk-1",
          score: 0.65,
          payload: {
            articleId: "art_100",
            title: "Architecture of StoryNest",
            slug: "architecture-of-storynest",
            category: "Architecture",
            status: "active",
            chunkIndex: 0,
            chunkText: "StoryNest uses Appwrite as the backend database and auth provider.",
          },
        },
        {
          id: "chunk-2",
          score: 0.58,
          payload: {
            articleId: "art_100",
            title: "Architecture of StoryNest",
            slug: "architecture-of-storynest",
            category: "Architecture",
            status: "active",
            chunkIndex: 1,
            chunkText: "State is managed with Redux Toolkit on the client.",
          },
        },
      ],
    };

    const mockChatService = {
      generateAnswer: async ({ question, chunks }) => {
        assert.equal(chunks.length, 2);
        return {
          answer: "StoryNest uses Appwrite for the database and auth, and Redux Toolkit for state.",
          insufficientContext: false,
        };
      },
    };

    const ragService = new RagQueryService({
      embeddingProvider: mockEmbeddingProvider,
      vectorStore: mockVectorStore,
      chatService: mockChatService,
      similarityThreshold: 0.4,
    });

    const response = await ragService.ask({
      question: "What backend and state management does StoryNest use?",
    });

    assert.equal(response.insufficientContext, false);
    assert.ok(response.answer.includes("StoryNest uses Appwrite"));
    assert.equal(response.sources.length, 1);
    assert.equal(response.sources[0].articleId, "art_100");
    assert.equal(response.sources[0].title, "Architecture of StoryNest");
    assert.equal(response.sources[0].slug, "architecture-of-storynest");
    assert.equal(response.sources[0].category, "Architecture");
    assert.equal(response.sources[0].relevantChunks.length, 2);
  });

  // 2. Irrelevant context (below threshold) produces insufficientContext
  test("irrelevant context below similarity threshold produces insufficientContext", async () => {
    const mockEmbeddingProvider = {
      embedQuery: async () => sampleVector,
    };

    const mockVectorStore = {
      search: async () => [
        {
          id: "chunk-low",
          score: 0.22, // Below threshold 0.40
          payload: {
            articleId: "art_unrelated",
            title: "Unrelated Cooking Recipe",
            chunkIndex: 0,
            chunkText: "Add salt to water.",
          },
        },
      ],
    };

    let chatCalled = false;
    const mockChatService = {
      generateAnswer: async () => {
        chatCalled = true;
        return { answer: "Should not be called", insufficientContext: true };
      },
    };

    const ragService = new RagQueryService({
      embeddingProvider: mockEmbeddingProvider,
      vectorStore: mockVectorStore,
      chatService: mockChatService,
      similarityThreshold: 0.4,
    });

    const response = await ragService.ask({
      question: "How do I make chocolate cake?",
    });

    assert.equal(response.insufficientContext, true);
    assert.ok(response.answer.includes("not enough information"));
    assert.equal(response.sources.length, 0);
    assert.equal(chatCalled, false, "Chat API should not be called when context threshold is not met");
  });

  // 3. Empty or too short question is rejected
  test("empty or invalid question is rejected with validation error", async () => {
    const ragService = new RagQueryService({
      embeddingProvider: {},
      vectorStore: {},
      chatService: {},
    });

    await assert.rejects(
      async () => ragService.ask({ question: "   " }),
      /Question must be at least 3 characters long/
    );

    await assert.rejects(
      async () => ragService.ask({ question: "a" }),
      /Question must be at least 3 characters long/
    );
  });

  // 4. API failure is handled safely
  test("underlying API failure is surfaced safely", async () => {
    const mockFailingEmbedding = {
      embedQuery: async () => {
        throw new Error("OpenRouter rate limit exceeded");
      },
    };

    const ragService = new RagQueryService({
      embeddingProvider: mockFailingEmbedding,
      vectorStore: {},
      chatService: {},
    });

    await assert.rejects(
      async () => ragService.ask({ question: "Valid question here" }),
      /OpenRouter rate limit exceeded/
    );
  });

  // 5. Source metadata is returned correctly and deduplicated
  test("deduplicates redundant chunks from the same article", async () => {
    const mockEmbeddingProvider = { embedQuery: async () => sampleVector };
    const mockVectorStore = {
      search: async () => [
        {
          id: "chunk-dup-1",
          score: 0.6,
          payload: { articleId: "art_dup", title: "Dup Article", chunkIndex: 0, chunkText: "Text A" },
        },
        {
          id: "chunk-dup-2",
          score: 0.55,
          payload: { articleId: "art_dup", title: "Dup Article", chunkIndex: 0, chunkText: "Text A" },
        },
      ],
    };

    const mockChatService = {
      generateAnswer: async () => ({ answer: "Answer", insufficientContext: false }),
    };

    const ragService = new RagQueryService({
      embeddingProvider: mockEmbeddingProvider,
      vectorStore: mockVectorStore,
      chatService: mockChatService,
      similarityThreshold: 0.35,
    });

    const response = await ragService.ask({ question: "Tell me about Dup" });
    assert.equal(response.sources.length, 1);
    assert.equal(response.sources[0].relevantChunks.length, 1, "Duplicate chunkIndex must be deduplicated");
  });

  // 6. Article-aware scoped query (Feature 2)
  test("scoped article query filters vectors by articleId", async () => {
    let capturedSearchOptions = null;
    const mockEmbeddingProvider = { embedQuery: async () => sampleVector };
    const mockVectorStore = {
      search: async (opts) => {
        capturedSearchOptions = opts;
        return [
          {
            id: "chunk-art-1",
            score: 0.72,
            payload: {
              articleId: "art_scoped_42",
              title: "Scoped Article Title",
              slug: "scoped-article",
              category: "Tech",
              status: "active",
              chunkIndex: 0,
              chunkText: "Scoped article chunk content about React hooks.",
            },
          },
        ];
      },
    };

    const mockChatService = {
      generateAnswer: async ({ mode, articleTitle }) => {
        assert.equal(mode, "article");
        assert.equal(articleTitle, "Scoped Article Title");
        return {
          answer: "React hooks allow function components to hold state.",
          insufficientContext: false,
        };
      },
    };

    const ragService = new RagQueryService({
      embeddingProvider: mockEmbeddingProvider,
      vectorStore: mockVectorStore,
      chatService: mockChatService,
      similarityThreshold: 0.4,
    });

    const response = await ragService.ask({
      question: "How do React hooks work in this article?",
      mode: "article",
      contextArticleId: "art_scoped_42",
    });

    assert.equal(capturedSearchOptions.articleId, "art_scoped_42");
    assert.equal(response.mode, "article");
    assert.equal(response.contextArticleId, "art_scoped_42");
    assert.equal(response.insufficientContext, false);
    assert.equal(response.sources.length, 1);
    assert.equal(response.sources[0].articleId, "art_scoped_42");
  });

  // 7. Scoped article query returns specific message when article doesn't have the answer
  test("scoped article query with no matching chunks returns specific article context message", async () => {
    const mockEmbeddingProvider = { embedQuery: async () => sampleVector };
    const mockVectorStore = {
      search: async () => [], // No matches for this article
    };

    const ragService = new RagQueryService({
      embeddingProvider: mockEmbeddingProvider,
      vectorStore: mockVectorStore,
      chatService: {},
      similarityThreshold: 0.4,
    });

    const response = await ragService.ask({
      question: "What is quantum computing?",
      mode: "article",
      contextArticleId: "art_scoped_42",
    });

    assert.equal(response.insufficientContext, true);
    assert.equal(response.mode, "article");
    assert.equal(response.contextArticleId, "art_scoped_42");
    assert.equal(
      response.answer,
      "This article does not contain enough information to answer your question. Try asking about the broader platform or switch to 'All Articles'."
    );
  });

  // 8. Rejects mode: 'article' when contextArticleId is missing
  test("rejects mode 'article' without contextArticleId", async () => {
    const ragService = new RagQueryService({
      embeddingProvider: {},
      vectorStore: {},
      chatService: {},
    });

    await assert.rejects(
      async () => ragService.ask({ question: "Tell me more", mode: "article" }),
      /contextArticleId is required when mode is 'article'/
    );
  });
});
