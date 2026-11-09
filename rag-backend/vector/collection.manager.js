/**
 * Manages Qdrant collection lifecycle and ensures dynamic vector dimension detection.
 */
export class CollectionManager {
  /**
   * @param {Object} options
   * @param {import("@qdrant/js-client-rest").QdrantClient} options.client
   * @param {import("../providers/base.embedding.js").BaseEmbeddingProvider} options.embeddingProvider
   * @param {string} options.collectionName
   */
  constructor({ client, embeddingProvider, collectionName }) {
    if (!client) throw new Error("CollectionManager: client is required");
    if (!embeddingProvider) throw new Error("CollectionManager: embeddingProvider is required");
    if (!collectionName) throw new Error("CollectionManager: collectionName is required");

    this.client = client;
    this.embeddingProvider = embeddingProvider;
    this.collectionName = collectionName;
  }

  /**
   * Checks whether the collection already exists in Qdrant.
   * @returns {Promise<boolean>}
   */
  async collectionExists() {
    try {
      const response = await this.client.getCollections();
      const collections = response.collections || [];
      return collections.some((c) => c.name === this.collectionName);
    } catch (error) {
      console.error(`CollectionManager :: collectionExists error:`, error);
      throw error;
    }
  }

  /**
   * Ensures the collection exists with dynamic dimension detection and Cosine distance.
   * Creates payload schema indices for fast filtering.
   * @returns {Promise<{ collectionName: string, dimension: number, created: boolean }>}
   */
  async ensureCollection() {
    const exists = await this.collectionExists();
    if (exists) {
      const info = await this.client.getCollection(this.collectionName);
      const existingDim =
        info.config?.params?.vectors?.size ||
        (typeof info.config?.params?.vectors === "object"
          ? Object.values(info.config.params.vectors)[0]?.size
          : null);
      return {
        collectionName: this.collectionName,
        dimension: existingDim,
        created: false,
      };
    }

    // Dynamic dimension verification via embedding provider
    const dimension = await this.embeddingProvider.getDimension();
    if (!dimension || typeof dimension !== "number" || dimension <= 0) {
      throw new Error(
        `Invalid detected vector dimension (${dimension}). Collection creation aborted.`
      );
    }

    console.log(
      `CollectionManager :: Creating collection "${this.collectionName}" with dimension ${dimension} (Cosine)...`
    );

    await this.client.createCollection(this.collectionName, {
      vectors: {
        size: dimension,
        distance: "Cosine",
      },
      optimizers_config: {
        default_segment_number: 2,
      },
      replication_factor: 1,
    });

    // Create payload indexes for metadata filtering
    await this.createPayloadIndexes();

    return {
      collectionName: this.collectionName,
      dimension,
      created: true,
    };
  }

  /**
   * Creates payload indexes for fast query filtering on articleId, status, and category.
   */
  async createPayloadIndexes() {
    const indexFields = [
      { field_name: "articleId", field_schema: "keyword" },
      { field_name: "status", field_schema: "keyword" },
      { field_name: "category", field_schema: "keyword" },
    ];

    for (const { field_name, field_schema } of indexFields) {
      try {
        await this.client.createPayloadIndex(this.collectionName, {
          field_name,
          field_schema,
          wait: true,
        });
      } catch (err) {
        // Ignore if index already exists
        if (!err.message?.includes("already exists")) {
          console.warn(`CollectionManager :: warning creating index for ${field_name}:`, err.message);
        }
      }
    }
  }
}

export default CollectionManager;

