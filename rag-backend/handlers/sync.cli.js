#!/usr/bin/env node

import { Client, Databases, Query } from "node-appwrite";
import { getEnv } from "../config/env.js";
import { createEmbeddingProvider } from "../providers/index.js";
import { createQdrantClient } from "../vector/qdrant.client.js";
import { CollectionManager } from "../vector/collection.manager.js";
import { VectorStore, generatePointId } from "../vector/vector.store.js";
import { ArticleProcessor } from "../pipeline/article.processor.js";
import { cleanHtml } from "../pipeline/html.cleaner.js";
import { chunkArticle } from "../pipeline/chunker.js";

async function runSync() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");

  // Configurable min-length (default 200 characters to exclude test stubs)
  let minLength = 200;
  const minLengthIdx = args.indexOf("--min-length");
  if (minLengthIdx !== -1 && args[minLengthIdx + 1]) {
    minLength = parseInt(args[minLengthIdx + 1], 10) || 0;
  }

  // Optional articleId filter for targeted single-article sync
  let targetArticleId = null;
  const articleIdIdx = args.indexOf("--article-id");
  if (articleIdIdx !== -1 && args[articleIdIdx + 1]) {
    targetArticleId = args[articleIdIdx + 1].trim();
  }

  console.log("==================================================");
  console.log(
    isDryRun
      ? "🔎 Ask StoryNest :: Article Indexing (DRY-RUN MODE)"
      : "🚀 Ask StoryNest :: Article Indexing (LIVE SYNC MODE)"
  );
  console.log("==================================================");
  console.log(`• Minimum Content Length Filter: ${minLength} characters`);
  if (targetArticleId) {
    console.log(`• Target Article ID Filter:      ${targetArticleId}`);
  }
  if (isDryRun) {
    console.log("ℹ️  Dry-run: No embedding API calls will be made, and Qdrant will not be modified.\n");
  } else {
    console.log("");
  }

  let env;
  try {
    env = getEnv();
  } catch (err) {
    console.error("\n❌ Environment configuration error:");
    console.error(err.message);
    process.exit(1);
  }

  // 1. Initialize Appwrite Admin Client
  console.log("1. Connecting to Appwrite...");
  const appwriteClient = new Client();
  appwriteClient
    .setEndpoint(env.APPWRITE_ENDPOINT)
    .setProject(env.APPWRITE_PROJECT_ID)
    .setKey(env.APPWRITE_API_KEY);

  const databases = new Databases(appwriteClient);

  // 2. Initialize Qdrant Client & Check Collection
  console.log(`2. Connecting to Qdrant cluster...`);
  const qdrantClient = createQdrantClient({
    url: env.QDRANT_URL,
    apiKey: env.QDRANT_API_KEY,
  });

  const embeddingProvider = createEmbeddingProvider(env);

  const collectionManager = new CollectionManager({
    client: qdrantClient,
    embeddingProvider,
    collectionName: env.QDRANT_COLLECTION_NAME,
  });

  let collectionInfo;
  try {
    collectionInfo = await collectionManager.ensureCollection();
    console.log(
      `   ✓ Qdrant Collection: "${collectionInfo.collectionName}" (Dimension: ${collectionInfo.dimension}, Distance: Cosine)\n`
    );
  } catch (err) {
    console.error("   ✗ Qdrant collection check failed:", err.message);
    process.exit(1);
  }

  // 3. Process Articles from Appwrite Database
  console.log(
    `3. Querying Appwrite database "${env.APPWRITE_DATABASE_ID}", collection "${env.APPWRITE_COLLECTION_ID}"...`
  );

  const BATCH_LIMIT = 50;
  let offset = 0;
  let hasMore = true;

  let totalActive = 0;
  let totalIndexed = 0;
  let totalSkipped = 0;
  let totalChunks = 0;
  let totalVectorsInserted = 0;
  const embeddingErrors = [];
  const indexedArticles = [];

  const vectorStore = new VectorStore({
    client: qdrantClient,
    collectionName: env.QDRANT_COLLECTION_NAME,
  });

  const processor = new ArticleProcessor({
    vectorStore,
    embeddingProvider,
    minContentLength: minLength,
  });

  while (hasMore) {
    const queries = [
      Query.equal("status", "active"),
      Query.orderDesc("$createdAt"),
      Query.limit(BATCH_LIMIT),
      Query.offset(offset),
    ];

    if (targetArticleId) {
      queries.push(Query.equal("$id", targetArticleId));
    }

    const response = await databases.listDocuments(
      env.APPWRITE_DATABASE_ID,
      env.APPWRITE_COLLECTION_ID,
      queries
    );

    const documents = response.documents || [];
    if (documents.length === 0) {
      hasMore = false;
      break;
    }

    console.log(
      `   Batch: ${offset + 1} to ${offset + documents.length} of ${response.total} active articles...`
    );

    for (const doc of documents) {
      totalActive++;
      const rawHtml = doc.content || "";
      const cleanText = cleanHtml(rawHtml);

      // Check min length or target filter
      if (!cleanText || cleanText.length < minLength) {
        totalSkipped++;
        console.log(
          `   - [CURATED OUT] "${doc.title || doc.$id}" (${cleanText.length} chars < ${minLength} min threshold)`
        );
        continue;
      }

      if (isDryRun) {
        const chunks = chunkArticle({
          article: doc,
          cleanText,
          chunkSize: 1200,
          chunkOverlap: 200,
        });

        totalIndexed++;
        totalChunks += chunks.length;
        console.log(
          `   ✓ [DRY-RUN MATCH] "${doc.title}" | Chunks: ${chunks.length} | Text: ${cleanText.length} chars`
        );
      } else {
        // LIVE SYNC: Embed and upsert to Qdrant
        try {
          console.log(
            `   ⏳ Indexing "${doc.title}" (${cleanText.length} chars)...`
          );
          const result = await processor.processArticle(doc);

          if (result.action === "indexed") {
            totalIndexed++;
            totalChunks += result.chunksCount;
            totalVectorsInserted += result.vectorsCount;
            indexedArticles.push({
              id: doc.$id,
              title: doc.title,
              category: doc.category,
              chunksCount: result.chunksCount,
              vectorsCount: result.vectorsCount,
              qdrantStatus: result.qdrantResult?.status || "completed",
            });
            console.log(
              `   ✅ [INDEXED] "${doc.title}" -> ${result.chunksCount} chunks, ${result.vectorsCount} vectors inserted (Qdrant: ${result.qdrantResult?.status || 'completed'})`
            );
          } else {
            totalSkipped++;
            console.log(`   - [SKIPPED] "${doc.title}" (${result.reason})`);
          }
        } catch (err) {
          console.error(`   ✗ [ERROR] Failed to index "${doc.title}":`, err.message);
          embeddingErrors.push({
            articleId: doc.$id,
            title: doc.title,
            error: err.message,
          });
        }
      }
    }

    offset += documents.length;
    if (offset >= response.total || targetArticleId) {
      hasMore = false;
    }
  }

  // 4. Report Summary
  console.log("\n==================================================");
  console.log(
    isDryRun
      ? "📊 Dry-Run Verification Summary"
      : "🎉 Synchronization Summary"
  );
  console.log("==================================================");
  console.log(`• Qdrant Collection:        ${env.QDRANT_COLLECTION_NAME}`);
  console.log(`• Vector Dimension:         ${collectionInfo.dimension}`);
  console.log(`• Distance Metric:          Cosine`);
  console.log(`• Active Articles Scanned:  ${totalActive}`);
  console.log(`• Articles Curated Out:     ${totalSkipped}`);
  console.log(`• Articles Indexed:         ${totalIndexed}`);
  console.log(`• Chunks Created:           ${totalChunks}`);
  console.log(`• Vectors Inserted:         ${totalVectorsInserted}`);
  console.log(`• Embedding API Errors:     ${embeddingErrors.length}`);

  if (indexedArticles.length > 0) {
    console.log("\nIndexed Articles Breakdown:");
    indexedArticles.forEach((a, i) => {
      console.log(
        `  ${i + 1}. "${a.title}" [${a.id}]`
      );
      console.log(
        `     Category: ${a.category} | Chunks: ${a.chunksCount} | Vectors: ${a.vectorsCount} | Qdrant Status: ${a.qdrantStatus}`
      );
    });
  }

  if (embeddingErrors.length > 0) {
    console.log("\n⚠️ Errors Encountered:");
    embeddingErrors.forEach((e) => {
      console.log(`  - "${e.title}": ${e.error}`);
    });
  }

  console.log("==================================================");

  return {
    totalIndexed,
    totalChunks,
    totalVectorsInserted,
    embeddingErrors,
    indexedArticles,
  };
}

runSync().catch((err) => {
  console.error("\n❌ Fatal sync error:", err);
  process.exit(1);
});
