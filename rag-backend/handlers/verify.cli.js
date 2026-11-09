#!/usr/bin/env node

import { Client, Databases, Query } from "node-appwrite";
import { getEnv } from "../config/env.js";
import { createEmbeddingProvider } from "../providers/index.js";
import { createQdrantClient } from "../vector/qdrant.client.js";
import { CollectionManager } from "../vector/collection.manager.js";

function sanitize(str, secrets = []) {
  let s = String(str);
  for (const secret of secrets) {
    if (secret && secret.length > 4) {
      s = s.replaceAll(secret, "[REDACTED]");
    }
  }
  return s;
}

async function verifyAll() {
  console.log("==================================================");
  console.log("🔍 Ask StoryNest :: Service Verification Suite");
  console.log("==================================================\n");

  let env;
  try {
    env = getEnv();
    console.log("✅ Environment configuration successfully loaded and validated.\n");
  } catch (err) {
    console.error("❌ Environment configuration error:");
    console.error(err.message);
    process.exit(1);
  }

  const secrets = [
    env.APPWRITE_API_KEY,
    env.QDRANT_API_KEY,
    env.OPENROUTER_API_KEY,
  ];

  let detectedDimension = null;
  const results = {
    openrouter: { success: false, details: null, error: null },
    qdrant: { success: false, details: null, error: null },
    appwrite: { success: false, details: null, error: null },
  };

  // ----------------------------------------------------------------
  // 1. OpenRouter Embeddings Verification
  // ----------------------------------------------------------------
  console.log("1. Verifying OpenRouter Embedding Connection...");
  const t0 = Date.now();
  try {
    const embeddingProvider = createEmbeddingProvider(env);
    detectedDimension = await embeddingProvider.detectDimension();
    const duration = Date.now() - t0;
    results.openrouter.success = true;
    results.openrouter.details = {
      model: env.OPENROUTER_EMBEDDING_MODEL,
      endpoint: env.OPENROUTER_BASE_URL,
      detectedDimension,
      latencyMs: duration,
    };
    console.log(`   ✓ OpenRouter: SUCCESS (${duration}ms)`);
    console.log(`     Model: ${env.OPENROUTER_EMBEDDING_MODEL}`);
    console.log(`     Detected Vector Dimension: ${detectedDimension}\n`);
  } catch (err) {
    results.openrouter.error = sanitize(err.message, secrets);
    console.error(`   ✗ OpenRouter: FAILED`);
    console.error(`     Error: ${results.openrouter.error}\n`);
  }

  // ----------------------------------------------------------------
  // 2. Qdrant Vector Storage Verification
  // ----------------------------------------------------------------
  console.log("2. Verifying Qdrant Vector Database Connection...");
  const t1 = Date.now();
  try {
    const qdrantClient = createQdrantClient({
      url: env.QDRANT_URL,
      apiKey: env.QDRANT_API_KEY,
    });

    if (!detectedDimension) {
      throw new Error(
        "Cannot verify/initialize Qdrant collection because OpenRouter dimension detection failed."
      );
    }

    const mockProviderWithDetectedDim = {
      getDimension: async () => detectedDimension,
    };

    const collectionManager = new CollectionManager({
      client: qdrantClient,
      embeddingProvider: mockProviderWithDetectedDim,
      collectionName: env.QDRANT_COLLECTION_NAME,
    });

    const colInfo = await collectionManager.ensureCollection();
    const duration = Date.now() - t1;

    results.qdrant.success = true;
    results.qdrant.details = {
      clusterUrl: env.QDRANT_URL.replace(/:[^:]*@/, "://[USER]:[PASS]@"),
      collectionName: colInfo.collectionName,
      vectorDimension: colInfo.dimension,
      distance: "Cosine",
      createdInThisRun: colInfo.created,
      latencyMs: duration,
    };

    console.log(`   ✓ Qdrant: SUCCESS (${duration}ms)`);
    console.log(`     Collection: ${colInfo.collectionName}`);
    console.log(`     Vector Dimension: ${colInfo.dimension}`);
    console.log(`     Distance Metric: Cosine`);
    console.log(`     Collection Status: ${colInfo.created ? "Created New" : "Existing & Verified"}\n`);
  } catch (err) {
    results.qdrant.error = sanitize(err.message, secrets);
    console.error(`   ✗ Qdrant: FAILED`);
    console.error(`     Error: ${results.qdrant.error}\n`);
  }

  // ----------------------------------------------------------------
  // 3. Appwrite Connection & Collection Schema Verification
  // ----------------------------------------------------------------
  console.log("3. Verifying Appwrite Database & Articles Collection...");
  const t2 = Date.now();
  try {
    const appwriteClient = new Client();
    appwriteClient
      .setEndpoint(env.APPWRITE_ENDPOINT)
      .setProject(env.APPWRITE_PROJECT_ID)
      .setKey(env.APPWRITE_API_KEY);

    const databases = new Databases(appwriteClient);

    const response = await databases.listDocuments(
      env.APPWRITE_DATABASE_ID,
      env.APPWRITE_COLLECTION_ID,
      [Query.limit(1)]
    );

    const duration = Date.now() - t2;
    results.appwrite.success = true;
    results.appwrite.details = {
      endpoint: env.APPWRITE_ENDPOINT,
      projectId: env.APPWRITE_PROJECT_ID,
      databaseId: env.APPWRITE_DATABASE_ID,
      collectionId: env.APPWRITE_COLLECTION_ID,
      totalDocuments: response.total,
      latencyMs: duration,
    };

    console.log(`   ✓ Appwrite: SUCCESS (${duration}ms)`);
    console.log(`     Database ID: ${env.APPWRITE_DATABASE_ID}`);
    console.log(`     Collection: ${env.APPWRITE_COLLECTION_ID}`);
    console.log(`     Accessible Articles: ${response.total} total documents found\n`);
  } catch (err) {
    results.appwrite.error = sanitize(err.message, secrets);
    console.error(`   ✗ Appwrite: FAILED`);
    console.error(`     Error: ${results.appwrite.error}\n`);
  }

  // ----------------------------------------------------------------
  // Summary
  // ----------------------------------------------------------------
  console.log("==================================================");
  console.log("📋 Final Verification Summary");
  console.log("==================================================");
  console.log(`OpenRouter Embeddings: ${results.openrouter.success ? "✅ PASSED" : "❌ FAILED"}`);
  console.log(`Qdrant Vector Database: ${results.qdrant.success ? "✅ PASSED" : "❌ FAILED"}`);
  console.log(`Appwrite Database:      ${results.appwrite.success ? "✅ PASSED" : "❌ FAILED"}`);
  console.log("==================================================");

  const allPassed =
    results.openrouter.success && results.qdrant.success && results.appwrite.success;

  if (!allPassed) {
    process.exit(1);
  }
}

verifyAll().catch((err) => {
  console.error("Unexpected error in verification runner:", err);
  process.exit(1);
});

