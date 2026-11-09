import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { splitTextIntoChunks, chunkArticle } from "../pipeline/chunker.js";

describe("Text Chunker", () => {
  test("returns single chunk for short text", () => {
    const text = "Short article body.";
    const chunks = splitTextIntoChunks(text, { chunkSize: 500, chunkOverlap: 50 });
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0], "Short article body.");
  });

  test("splits long text into overlapping segments", () => {
    // Generate text longer than chunkSize (150 chars, chunkSize=60, overlap=15)
    const paragraphs = [
      "First paragraph about React components.",
      "Second paragraph about Appwrite databases.",
      "Third paragraph about Qdrant vector search.",
      "Fourth paragraph about OpenRouter embeddings.",
    ].join("\n\n");

    const chunks = splitTextIntoChunks(paragraphs, { chunkSize: 80, chunkOverlap: 20 });
    assert.ok(chunks.length >= 3, `Expected at least 3 chunks, got ${chunks.length}`);

    // Verify overlap presence across adjacent chunks
    const chunk1 = chunks[0];
    const chunk2 = chunks[1];
    assert.ok(chunk1.length > 0);
    assert.ok(chunk2.length > 0);
  });

  test("chunkArticle injects contextual headers into embeddedText", () => {
    const article = {
      $id: "art_123",
      title: "Mastering React 19",
      category: "React",
      tags: ["react", "frontend", "hooks"],
      authorUsername: "alex",
    };
    const cleanText = "React 19 introduces server actions and improved transitions.";

    const result = chunkArticle({ article, cleanText, chunkSize: 500, chunkOverlap: 50 });
    assert.equal(result.length, 1);
    assert.equal(result[0].chunkIndex, 0);
    assert.equal(result[0].totalChunks, 1);
    assert.equal(result[0].chunkText, cleanText);
    assert.ok(result[0].embeddedText.includes("Article: Mastering React 19"));
    assert.ok(result[0].embeddedText.includes("Category: React"));
    assert.ok(result[0].embeddedText.includes("Tags: react, frontend, hooks"));
    assert.ok(result[0].embeddedText.endsWith(cleanText));
  });
});

