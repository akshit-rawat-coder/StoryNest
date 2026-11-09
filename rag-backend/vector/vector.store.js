import crypto from "node:crypto";

/**
 * Generates a deterministic UUID for a chunk vector point in Qdrant.
 * @param {string} articleId
 * @param {number} chunkIndex
 * @returns {string} Standard UUID format
 */
export function generatePointId(articleId, chunkIndex) {
  const hash = crypto
    .createHash("sha256")
    .update(`${articleId}_chunk_${chunkIndex}`)
    .digest("hex");
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    "4" + hash.substring(13, 16),
    "a" + hash.substring(17, 20),
    hash.substring(20, 32),
  ].join("-");
}

export class VectorStore {
  /**
   * @param {Object} options
   * @param {import("@qdrant/js-client-rest").QdrantClient} options.client
   * @param {string} options.collectionName
   */
  constructor({ client, collectionName }) {
    if (!client) throw new Error("VectorStore: client is required");
    if (!collectionName) throw new Error("VectorStore: collectionName is required");

    this.client = client;
    this.collectionName = collectionName;
  }

  /**
   * Upserts vector points into Qdrant collection.
   * @param {Array<{ id: string, vector: number[], payload: Object }>} points
   * @returns {Promise<Object>}
   */
  async upsertPoints(points) {
    if (!Array.isArray(points) || points.length === 0) {
      return { status: "empty", count: 0 };
    }

    const result = await this.client.upsert(this.collectionName, {
      wait: true,
      points,
    });

    return {
      status: result.status,
      count: points.length,
    };
  }

  /**
   * Deletes all vector points associated with an articleId.
   * @param {string} articleId
   * @returns {Promise<Object>}
   */
  async deleteByArticleId(articleId) {
    if (!articleId) {
      throw new Error("deleteByArticleId: articleId is required");
    }

    const result = await this.client.delete(this.collectionName, {
      wait: true,
      filter: {
        must: [
          {
            key: "articleId",
            match: { value: articleId },
          },
        ],
      },
    });

    return result;
  }

  /**
   * Searches for top-k similar vectors with optional metadata filters.
   * @param {Object} options
   * @param {number[]} options.vector - Query embedding
   * @param {number} [options.limit=5] - Number of results
   * @param {Object} [options.filter] - Qdrant filter object
   * @param {number} [options.scoreThreshold] - Minimum cosine similarity threshold
   * @param {string} [options.articleId] - Optional articleId filter for article-specific search
   * @returns {Promise<Array<{ id: string, score: number, payload: Object }>>}
   */
  async search({ vector, limit = 5, filter, scoreThreshold, articleId }) {
    if (!vector || !Array.isArray(vector)) {
      throw new Error("search: vector array is required");
    }

    // Default filter enforces active published articles only
    const mustClauses = [
      {
        key: "status",
        match: { value: "active" },
      },
    ];

    if (articleId) {
      mustClauses.push({
        key: "articleId",
        match: { value: articleId },
      });
    }

    let effectiveFilter = { must: mustClauses };
    if (filter?.must) {
      effectiveFilter = {
        must: [...mustClauses, ...filter.must],
      };
    } else if (filter) {
      effectiveFilter = {
        must: [...mustClauses, filter],
      };
    }

    if (typeof this.client.query === "function") {
      const queryParams = {
        query: vector,
        limit,
        filter: effectiveFilter,
        with_payload: true,
      };
      if (scoreThreshold !== undefined) {
        queryParams.score_threshold = scoreThreshold;
      }
      const res = await this.client.query(this.collectionName, queryParams);
      const hits = res.points || [];
      return hits.map((hit) => ({
        id: hit.id,
        score: hit.score,
        payload: hit.payload,
      }));
    }

    const searchParams = {
      vector,
      limit,
      filter: effectiveFilter,
      with_payload: true,
    };

    if (scoreThreshold !== undefined) {
      searchParams.score_threshold = scoreThreshold;
    }

    const results = await this.client.search(this.collectionName, searchParams);
    return results.map((hit) => ({
      id: hit.id,
      score: hit.score,
      payload: hit.payload,
    }));
  }
}

export default VectorStore;

