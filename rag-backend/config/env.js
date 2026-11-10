import { z } from "zod";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from rag-backend directory
dotenv.config({ path: path.resolve(__dirname, "../.env") });

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),

  // Appwrite (Server-side admin credentials & TablesDB IDs)
  APPWRITE_ENDPOINT: z.string().url().default("https://fra.cloud.appwrite.io/v1"),
  APPWRITE_PROJECT_ID: z.string().min(1, "APPWRITE_PROJECT_ID is required"),
  APPWRITE_DATABASE_ID: z.string().min(1, "APPWRITE_DATABASE_ID is required"),
  APPWRITE_TABLE_ID: z.string().min(1).optional(),
  APPWRITE_SYNC_JOBS_TABLE_ID: z.string().min(1).default("6af2a4b5001496679e4c"),
  APPWRITE_COLLECTION_ID: z.string().min(1).optional(),
  APPWRITE_API_KEY: z.string().min(1, "APPWRITE_API_KEY is required"),

  // Qdrant Vector Database
  QDRANT_URL: z.string().url("QDRANT_URL must be a valid URL"),
  QDRANT_API_KEY: z.string().min(1, "QDRANT_API_KEY is required"),
  QDRANT_COLLECTION_NAME: z.string().min(1).default("storynest"),

  // OpenRouter Embeddings
  OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY is required"),
  OPENROUTER_EMBEDDING_MODEL: z.string().min(1).default("openai/text-embedding-3-small"),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),

  // OpenRouter Chat Model for RAG Synthesis
  OPENROUTER_CHAT_MODEL: z.string().min(1).default("openai/gpt-4o-mini"),
  OPENROUTER_CHAT_MAX_TOKENS: z.coerce.number().int().positive().default(1000),

  // RAG Search Configuration
  SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.35),
  TOP_K_CHUNKS: z.coerce.number().int().positive().default(5),

  // Rate Limiting
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),

  // Webhook & Automation Security (no insecure default; strictly required in production)
  WEBHOOK_SECRET: z.string().default(""),
  CRON_SECRET: z.string().default(""),
}).superRefine((data, ctx) => {
  if (data.NODE_ENV === "production" && (!data.WEBHOOK_SECRET || !data.WEBHOOK_SECRET.trim())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["WEBHOOK_SECRET"],
      message: "WEBHOOK_SECRET is required in production environment",
    });
  }
}).transform((data) => {
  const resolvedTableId = data.APPWRITE_TABLE_ID || data.APPWRITE_COLLECTION_ID || "articles";
  return {
    ...data,
    APPWRITE_TABLE_ID: resolvedTableId,
    APPWRITE_COLLECTION_ID: data.APPWRITE_COLLECTION_ID || resolvedTableId,
  };
});

/**
 * Validates and returns the loaded environment configuration.
 * @param {Record<string, string|undefined>} [overrideEnv] - Optional env map for testing
 * @returns {z.infer<typeof envSchema>}
 */
export function getEnv(overrideEnv = process.env) {
  const result = envSchema.safeParse(overrideEnv);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => ` - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`RAG Backend Environment Validation Failed:\n${errorDetails}`);
  }
  return result.data;
}

export default getEnv;
