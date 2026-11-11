import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { OpenRouterChatService } from "../services/chat.service.js";

const chunks = [
  {
    title: "Test Article",
    category: "Technology",
    chunkText: "Edge computing processes data close to where it is generated.",
  },
];

function createSuccessFetch(capturedRequests) {
  return async (url, options) => {
    capturedRequests.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ answer: "Answer", insufficientContext: false }) } }],
      }),
    };
  };
}

describe("OpenRouter chat service configuration and errors", () => {
  test("uses the 800 default for normal answers and summaries", async () => {
    const requests = [];
    const service = new OpenRouterChatService({
      apiKey: "test-key",
      fetchFn: createSuccessFetch(requests),
    });

    await service.generateAnswer({ question: "Explain edge computing", chunks });
    await service.generateAnswer({
      question: "Summarize this article",
      chunks,
      mode: "article",
      articleTitle: "Test Article",
      isSummarization: true,
    });

    assert.deepEqual(requests.map(({ body }) => body.max_tokens), [800, 800]);
  });

  test("preserves a configured token-limit override for normal answers and summaries", async () => {
    const requests = [];
    const service = new OpenRouterChatService({
      apiKey: "test-key",
      maxTokens: 640,
      fetchFn: createSuccessFetch(requests),
    });

    await service.generateAnswer({ question: "Explain edge computing", chunks });
    await service.generateAnswer({
      question: "Summarize this article",
      chunks,
      mode: "article",
      articleTitle: "Test Article",
      isSummarization: true,
    });

    assert.deepEqual(requests.map(({ body }) => body.max_tokens), [640, 640]);
  });

  test("maps OpenRouter 402 to a friendly error and logs only safe metadata", async () => {
    const originalConsoleError = console.error;
    const logs = [];
    let responseBodyRead = false;
    console.error = (...args) => logs.push(args.join(" "));

    try {
      const service = new OpenRouterChatService({
        apiKey: "must-not-be-logged",
        fetchFn: async () => ({
          ok: false,
          status: 402,
          text: async () => {
            responseBodyRead = true;
            return "provider details must not be exposed";
          },
        }),
      });

      await assert.rejects(
        service.generateAnswer({ question: "Explain edge computing", chunks }),
        (error) => {
          assert.equal(error.name, "OpenRouterCreditsError");
          assert.equal(error.status, 503);
          assert.match(error.message, /insufficient available credits/i);
          assert.doesNotMatch(error.message, /provider details|must-not-be-logged/i);
          return true;
        }
      );
    } finally {
      console.error = originalConsoleError;
    }

    assert.equal(responseBodyRead, false);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /insufficient_credits/);
    assert.doesNotMatch(logs[0], /must-not-be-logged|provider details/i);
  });
});