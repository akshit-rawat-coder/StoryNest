import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { cleanHtml } from "../pipeline/html.cleaner.js";

describe("HTML Cleaner", () => {
  test("strips standard HTML tags while preserving line breaks", () => {
    const html = "<p>First paragraph.</p><p>Second paragraph with <strong>bold</strong> and <em>italics</em>.</p>";
    const cleaned = cleanHtml(html);
    assert.equal(cleaned, "First paragraph.\n\nSecond paragraph with bold and italics.");
  });

  test("decodes common HTML entities", () => {
    const html = "<p>React &amp; Vite &lt;3 StoryNest &quot;RAG&quot; &#39;test&#39;&nbsp;spaces</p>";
    const cleaned = cleanHtml(html);
    assert.equal(cleaned, 'React & Vite <3 StoryNest "RAG" \'test\' spaces');
  });

  test("handles empty or null inputs", () => {
    assert.equal(cleanHtml(""), "");
    assert.equal(cleanHtml(null), "");
    assert.equal(cleanHtml(undefined), "");
  });

  test("collapses excessive whitespace and newlines", () => {
    const html = "<div><h1>Title</h1>\n\n\n\n\n<p>Body   with    extra    spaces.</p></div>";
    const cleaned = cleanHtml(html);
    assert.equal(cleaned, "Title\n\nBody with extra spaces.");
  });
});

