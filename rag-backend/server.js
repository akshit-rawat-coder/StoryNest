import http from "node:http";
import { Client, Databases } from "node-appwrite";
import { getEnv } from "./config/env.js";
import { createEmbeddingProvider } from "./providers/index.js";
import { createQdrantClient } from "./vector/qdrant.client.js";
import { VectorStore } from "./vector/vector.store.js";
import { OpenRouterChatService } from "./services/chat.service.js";
import { RagQueryService } from "./services/rag.service.js";
import { ArticleProcessor } from "./pipeline/article.processor.js";
import { SyncService } from "./services/sync.service.js";
import { SyncJobStore } from "./services/job.store.js";

/**
 * In-memory sliding-window rate limiter per client IP.
 */
class RateLimiter {
  constructor({ maxRequests = 30, windowMs = 60000 } = {}) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map();

    // Periodic cleanup of stale entries every 5 minutes
    if (typeof setInterval !== "undefined") {
      setInterval(() => this.cleanup(), 300000).unref?.();
    }
  }

  isAllowed(ip) {
    const now = Date.now();
    const timestamps = this.requests.get(ip) || [];
    const recent = timestamps.filter((t) => now - t < this.windowMs);

    if (recent.length >= this.maxRequests) {
      this.requests.set(ip, recent);
      return false;
    }

    recent.push(now);
    this.requests.set(ip, recent);
    return true;
  }

  cleanup() {
    const now = Date.now();
    for (const [ip, timestamps] of this.requests.entries()) {
      const active = timestamps.filter((t) => now - t < this.windowMs);
      if (active.length === 0) {
        this.requests.delete(ip);
      } else {
        this.requests.set(ip, active);
      }
    }
  }
}

/**
 * Creates the request handler function compatible with both native http.Server and Vercel Serverless Functions.
 * @param {Object} [options]
 * @param {Object} [options.env]
 * @param {RagQueryService} [options.ragQueryService]
 * @param {SyncService} [options.syncService]
 * @returns {(req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>}
 */
export function createRequestHandler(options = {}) {
  const env = options.env || getEnv();

  let ragService = options.ragQueryService;
  let syncService = options.syncService;

  if (!ragService || !syncService) {
    const embeddingProvider = createEmbeddingProvider(env);
    const qdrantClient = createQdrantClient({
      url: env.QDRANT_URL,
      apiKey: env.QDRANT_API_KEY,
    });
    const vectorStore = new VectorStore({
      client: qdrantClient,
      collectionName: env.QDRANT_COLLECTION_NAME,
    });

    if (!ragService) {
      const chatService = new OpenRouterChatService({
        apiKey: env.OPENROUTER_API_KEY,
        model: env.OPENROUTER_CHAT_MODEL,
        maxTokens: env.OPENROUTER_CHAT_MAX_TOKENS,
      });

      ragService = new RagQueryService({
        embeddingProvider,
        vectorStore,
        chatService,
        similarityThreshold: env.SIMILARITY_THRESHOLD,
        topK: env.TOP_K_CHUNKS,
      });
    }

    if (!syncService) {
      const articleProcessor = new ArticleProcessor({
        embeddingProvider,
        vectorStore,
      });

      const appwriteClient = new Client();
      appwriteClient
        .setEndpoint(env.APPWRITE_ENDPOINT)
        .setProject(env.APPWRITE_PROJECT_ID)
        .setKey(env.APPWRITE_API_KEY);
      const databases = new Databases(appwriteClient);

      const jobStore =
        options.jobStore ||
        new SyncJobStore({
          databases,
          databaseId: env.APPWRITE_DATABASE_ID,
          nodeEnv: env.NODE_ENV,
        });

      syncService = new SyncService({
        processor: articleProcessor,
        env,
        jobStore,
        databases,
      });
    }
  }

  const rateLimiter = new RateLimiter({
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
    windowMs: env.RATE_LIMIT_WINDOW_MS,
  });

  const MAX_BODY_BYTES = 500 * 1024; // 500 KB limit for webhooks/queries

  return async function requestHandler(req, res) {
    // 1. CORS Configuration:
    // Allows explicitly configured CORS_ORIGIN values, production domain (https://story-nest-theta.vercel.app),
    // and localhost / 127.0.0.1 for local development.
    const requestOrigin = req.headers.origin || "";
    const configuredOrigins = (env.CORS_ORIGIN || "*")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);

    const isAllowedOrigin =
      configuredOrigins.includes("*") ||
      configuredOrigins.includes(requestOrigin) ||
      requestOrigin === "https://story-nest-theta.vercel.app" ||
      /^http:\/\/localhost(:\d+)?$/.test(requestOrigin) ||
      /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(requestOrigin);

    if (isAllowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", requestOrigin || "*");
    } else {
      res.setHeader("Access-Control-Allow-Origin", configuredOrigins[0] || "*");
    }

    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Webhook-Secret, X-Appwrite-Webhook-Signature, X-Appwrite-Webhook-Event"
    );
    res.setHeader("Access-Control-Max-Age", "86400");

    // Handle preflight OPTIONS request
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const host = req.headers.host || "127.0.0.1";
    const url = new URL(req.url, `http://${host}`);

    // Resolve true requested path:
    // 1. Query parameter from Vercel rewrite (?path=...)
    // 2. Vercel / reverse-proxy header (x-matched-path, x-forwarded-uri)
    // 3. Direct url.pathname (local server / direct execution)
    const rawPath = (
      url.searchParams.get("path") ||
      req.headers["x-matched-path"] ||
      req.headers["x-forwarded-uri"] ||
      url.pathname
    )
      .split("?")[0]
      .replace(/\/index\.js$/, "");

    // Fast 204 for browser favicon probes
    if (rawPath === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Normalize path to support root / (health), /api/* and /* paths
    const normalized = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
    const pathname =
      normalized === "/" || normalized === ""
        ? "/api/health"
        : normalized.startsWith("/api")
          ? normalized
          : `/api${normalized}`;
    const querySecret = url.searchParams.get("secret") || "";

    const clientIp =
      req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      "127.0.0.1";

    // Helper to read JSON body (supports pre-parsed Vercel req.body AND stream)
    const readJsonBody = () =>
      new Promise((resolve, reject) => {
        // Handle pre-parsed body from Vercel / middleware
        if (req.body !== undefined && req.body !== null) {
          if (typeof req.body === "object") {
            return resolve(req.body);
          }
          if (typeof req.body === "string") {
            if (!req.body.trim()) return resolve({});
            try {
              return resolve(JSON.parse(req.body));
            } catch {
              const err = new Error("Invalid JSON body");
              err.status = 400;
              return reject(err);
            }
          }
        }

        // Stream reading for native Node http server
        const contentLength = parseInt(req.headers["content-length"] || "0", 10);
        if (contentLength > MAX_BODY_BYTES) {
          const err = new Error("Payload Too Large");
          err.status = 413;
          return reject(err);
        }

        let bodyString = "";
        let bytesReceived = 0;

        req.on("data", (chunk) => {
          bytesReceived += chunk.length;
          if (bytesReceived > MAX_BODY_BYTES) {
            const err = new Error("Payload Too Large");
            err.status = 413;
            req.destroy();
            return reject(err);
          }
          bodyString += chunk;
        });

        req.on("end", () => {
          if (!bodyString.trim()) {
            return resolve({});
          }
          try {
            const parsed = JSON.parse(bodyString);
            resolve(parsed);
          } catch {
            const err = new Error("Invalid JSON body");
            err.status = 400;
            reject(err);
          }
        });

        req.on("error", (err) => reject(err));
      });

    // 2. Health Endpoint
    if (req.method === "GET" && pathname === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          service: "ask-storynest-rag",
          model: env.OPENROUTER_CHAT_MODEL,
          collection: env.QDRANT_COLLECTION_NAME,
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    // 3. POST /api/ask Endpoint
    if (req.method === "POST" && pathname === "/api/ask") {
      if (!rateLimiter.isAllowed(clientIp)) {
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Too Many Requests",
            message: "Rate limit exceeded. Please wait a moment before asking another question.",
          })
        );
        return;
      }

      try {
        const json = await readJsonBody();
        const result = await ragService.ask(json);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        if (err.status) {
          res.writeHead(err.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
          return;
        }

        if (err.name === "ZodError") {
          const messages = err.issues.map((i) => i.message).join(", ");
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Validation Error", message: messages }));
          return;
        }

        console.error("RagServer :: error processing ask request:", err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Internal Server Error",
            message: "An error occurred while generating the answer. Please try again.",
          })
        );
      }
      return;
    }

    // 4. POST /api/webhooks/appwrite Endpoint
    if (req.method === "POST" && pathname === "/api/webhooks/appwrite") {
      const fullUrl = `https://${host}${url.pathname}${url.search}`;
      const isAuthValid = syncService.verifyWebhookAuth(req.headers, querySecret, fullUrl);
      if (!isAuthValid) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized", message: "Invalid webhook signature or secret" }));
        return;
      }

      try {
        const body = await readJsonBody();
        const event =
          req.headers["x-appwrite-webhook-event"] ||
          body.event ||
          "databases.articles.documents.update";
        const payload = body.payload || body;

        const result = await syncService.handleWebhookEvent({ event, payload });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, result }));
      } catch (err) {
        console.error("RagServer :: error in webhook processing:", err.message);
        res.writeHead(err.status || 500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message || "Webhook processing failed" }));
      }
      return;
    }

    // 5. POST /api/articles/sync-single Endpoint
    if (req.method === "POST" && pathname === "/api/articles/sync-single") {
      const fullUrl = `https://${host}${url.pathname}${url.search}`;
      const isAuthValid = syncService.verifyWebhookAuth(req.headers, querySecret, fullUrl);
      if (!isAuthValid) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized", message: "Invalid authorization" }));
        return;
      }

      try {
        const body = await readJsonBody();
        const { articleId, action = "upsert" } = body;
        if (!articleId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Validation Error", message: "articleId is required" }));
          return;
        }

        const result = await syncService.syncSingleArticle(articleId, action);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, result }));
      } catch (err) {
        console.error("RagServer :: error in single article sync:", err.message);
        res.writeHead(err.status || 500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message || "Article synchronization failed" }));
      }
      return;
    }

    // 6. POST / GET /api/jobs/worker (Worker sweep for pending & retry-due jobs)
    if ((req.method === "POST" || req.method === "GET") && pathname === "/api/jobs/worker") {
      const fullUrl = `https://${host}${url.pathname}${url.search}`;
      // Vercel Cron automatically sends header 'x-vercel-cron': '1' or authorization
      const isCron = req.headers["x-vercel-cron"] === "1";
      const isAuthValid = isCron || syncService.verifyWebhookAuth(req.headers, querySecret, fullUrl);

      if (!isAuthValid) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized", message: "Invalid authorization" }));
        return;
      }

      try {
        const sweepStats = await syncService.drainQueue(10);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, ...sweepStats }));
      } catch (err) {
        console.error("RagServer :: error in worker queue sweep:", err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message || "Queue sweep failed" }));
      }
      return;
    }

    // 7. GET /api/jobs/status (Operational telemetry & job tracking without exposing secrets)
    if (req.method === "GET" && pathname === "/api/jobs/status") {
      try {
        const stats = syncService.jobStore
          ? await syncService.jobStore.getJobStats()
          : { metrics: {}, recentJobs: [] };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", ...stats }));
      } catch (err) {
        console.error("RagServer :: error getting job stats:", err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message || "Failed to retrieve job status" }));
      }
      return;
    }

    // 8. POST /api/sync/reconcile (Reconciles Appwrite with Qdrant)
    if (req.method === "POST" && pathname === "/api/sync/reconcile") {
      const fullUrl = `https://${host}${url.pathname}${url.search}`;
      const isAuthValid = syncService.verifyWebhookAuth(req.headers, querySecret, fullUrl);
      if (!isAuthValid) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized", message: "Invalid authorization" }));
        return;
      }

      try {
        const body = await readJsonBody().catch(() => ({}));
        const dryRun = Boolean(body?.dryRun);
        const reconcileStats = await syncService.reconcile({ dryRun });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, ...reconcileStats }));
      } catch (err) {
        console.error("RagServer :: error in reconciliation:", err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message || "Reconciliation failed" }));
      }
      return;
    }

    // 404 Not Found
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Endpoint not found" }));
  };
}

/**
 * Creates and configures the HTTP server for local standalone execution and testing.
 * @param {Object} [options]
 * @returns {http.Server}
 */
export function createServer(options = {}) {
  const handler = createRequestHandler(options);
  return http.createServer(handler);
}

// Start standalone server if executed directly
const isDirectExecution =
  process.argv[1] &&
  (process.argv[1].endsWith("server.js") || process.argv[1].endsWith("server"));

if (isDirectExecution) {
  try {
    const env = getEnv();
    const server = createServer({ env });
    server.listen(env.PORT, () => {
      console.log("==================================================");
      console.log(`🚀 Ask StoryNest RAG Server running on port ${env.PORT}`);
      console.log(`• Health Check: http://localhost:${env.PORT}/api/health`);
      console.log(`• Ask Endpoint: POST http://localhost:${env.PORT}/api/ask`);
      console.log(`• Appwrite Webhook: POST http://localhost:${env.PORT}/api/webhooks/appwrite`);
      console.log(`• Single Sync: POST http://localhost:${env.PORT}/api/articles/sync-single`);
      console.log(`• Allowed CORS: ${env.CORS_ORIGIN}`);
      console.log(`• Chat Model:   ${env.OPENROUTER_CHAT_MODEL}`);
      console.log("==================================================");
    });
  } catch (err) {
    console.error("Failed to start server:", err.message);
    process.exit(1);
  }
}

export default createServer;
