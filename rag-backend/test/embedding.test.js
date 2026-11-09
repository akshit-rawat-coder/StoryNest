import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { OpenRouterEmbeddingProvider } from "../providers/openrouter.embedding.js";

describe("OpenRouter Embedding Provider", () => {
  test("generates embeddings and dynamically detects vector dimension", async () => {
    const mockVector1536 = new Array(1536).fill(0.025);

    const mockFetch = async (url, options) => {
      assert.ok(url.includes("/embeddings"));
      assert.equal(options.method, "POST");

      const body = JSON.parse(options.body);
      assert.equal(body.model, "openai/text-embedding-3-small");

      const inputs = Array.isArray(body.input) ? body.input : [body.input];
      return {
        ok: true,
        json: async () => ({
          data: inputs.map((_, idx) => ({
            index: idx,
            embedding: mockVector1536,
          })),
        }),
      };
    };

    const provider = new OpenRouterEmbeddingProvider({
      apiKey: "test_key",
      model: "openai/text-embedding-3-small",
      fetchFn: mockFetch,
    });

    // Detect dimension dynamically
    const dim = await provider.detectDimension();
    assert.equal(dim, 1536);

    // Verify cached dimension
    const cachedDim = await provider.getDimension();
    assert.equal(cachedDim, 1536);

    // Verify single query embedding
    const single = await provider.embedQuery("Test query");
    assert.equal(single.length, 1536);

    // Verify batch embedding
    const batch = await provider.embedBatch(["Chunk 1", "Chunk 2"]);
    assert.equal(batch.length, 2);
    assert.equal(batch[0].length, 1536);
  });

  test("handles API errors gracefully", async () => {
    const mockFailingFetch = async () => ({
      ok: false,
      status: 401,
      text: async () => "Unauthorized: invalid OpenRouter key",
    });

    const provider = new OpenRouterEmbeddingProvider({
      apiKey: "bad_key",
      fetchFn: mockFailingFetch,
    });

    await assert.rejects(
      async () => provider.embedQuery("Hello"),
      /OpenRouter Embedding API failed with status 401/
    );
  });
});

