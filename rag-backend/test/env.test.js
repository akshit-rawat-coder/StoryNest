import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { envSchema } from "../config/env.js";

describe("Environment Validation", () => {
  test("accepts valid full configuration", () => {
    const validConfig = {
      NODE_ENV: "production",
      APPWRITE_ENDPOINT: "https://fra.cloud.appwrite.io/v1",
      APPWRITE_PROJECT_ID: "proj_123",
      APPWRITE_DATABASE_ID: "db_123",
      APPWRITE_COLLECTION_ID: "articles",
      APPWRITE_API_KEY: "appwrite_secret_key",
      QDRANT_URL: "https://cluster.qdrant.io:6333",
      QDRANT_API_KEY: "qdrant_secret_key",
      QDRANT_COLLECTION_NAME: "storynest",
      OPENROUTER_API_KEY: "openrouter_secret_key",
      OPENROUTER_EMBEDDING_MODEL: "openai/text-embedding-3-small",
      OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
    };

    const parsed = envSchema.parse(validConfig);
    assert.equal(parsed.APPWRITE_PROJECT_ID, "proj_123");
    assert.equal(parsed.QDRANT_COLLECTION_NAME, "storynest");
    assert.equal(parsed.OPENROUTER_EMBEDDING_MODEL, "openai/text-embedding-3-small");
  });

  test("uses sensible defaults for optional fields", () => {
    const minimalConfig = {
      APPWRITE_PROJECT_ID: "proj_123",
      APPWRITE_DATABASE_ID: "db_123",
      APPWRITE_API_KEY: "key_123",
      QDRANT_URL: "https://cluster.qdrant.io:6333",
      QDRANT_API_KEY: "q_key",
      OPENROUTER_API_KEY: "or_key",
    };

    const parsed = envSchema.parse(minimalConfig);
    assert.equal(parsed.NODE_ENV, "development");
    assert.equal(parsed.APPWRITE_COLLECTION_ID, "articles");
    assert.equal(parsed.QDRANT_COLLECTION_NAME, "storynest");
    assert.equal(parsed.OPENROUTER_EMBEDDING_MODEL, "openai/text-embedding-3-small");
    assert.equal(parsed.OPENROUTER_BASE_URL, "https://openrouter.ai/api/v1");
  });

  test("fails if required keys are missing", () => {
    const invalidConfig = {
      NODE_ENV: "development",
    };

    const result = envSchema.safeParse(invalidConfig);
    assert.equal(result.success, false);
    if (!result.success) {
      const missingFields = result.error.issues.map((i) => i.path[0]);
      assert.ok(missingFields.includes("APPWRITE_PROJECT_ID"));
      assert.ok(missingFields.includes("QDRANT_URL"));
      assert.ok(missingFields.includes("OPENROUTER_API_KEY"));
    }
  });

  test("fails if URLs are invalid", () => {
    const badUrlConfig = {
      APPWRITE_PROJECT_ID: "proj_123",
      APPWRITE_DATABASE_ID: "db_123",
      APPWRITE_API_KEY: "key_123",
      QDRANT_URL: "not-a-valid-url",
      QDRANT_API_KEY: "q_key",
      OPENROUTER_API_KEY: "or_key",
    };

    const result = envSchema.safeParse(badUrlConfig);
    assert.equal(result.success, false);
  });
});

