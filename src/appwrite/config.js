import conf from "../conf/conf";
import { Client, ID, TablesDB, Storage } from "appwrite";

export class Services {
  client = new Client();
  tablesDB;
  bucket;

  constructor() {
    this.client
      .setEndpoint(conf.appwriteUrl)
      .setProject(conf.appwriteProjectId);

    this.tablesDB = new TablesDB(this.client);
    this.bucket = new Storage(this.client);
  }

  // Create Post
  async createPost({ title, slug, content, featuredImage, status, userId, category, tags, authorUsername }) {
    try {
      return await this.tablesDB.createRow({
        databaseId: conf.appwriteDatabaseId,
        tableId: conf.appwriteCollectionId,
        rowId: ID.unique(),
          data: {
          title,
          slug,
          content,
          featuredImage,
          status,
          userId,
          category,
          tags,
          authorUsername,
      },
      });
    } catch (error) {
      console.log("Appwrite Service :: createPost :: error", error);
      throw error;
    }
  }

  // Update Post
  async updatePost(
    slug,
    { title, content, featuredImage, status, category, tags, authorUsername }
  ) {
    try {
      return await this.tablesDB.updateRow({
        databaseId: conf.appwriteDatabaseId,
        tableId: conf.appwriteCollectionId,
        rowId: slug,
        data: {
          title,
          content,
          featuredImage,
          status,
          category,
          tags,
          authorUsername,
        },
      });
    } catch (error) {
      console.log("Appwrite Service :: updatePost :: error", error);
      throw error;
    }
  }

  // Delete Post
  async deletePost(slug) {
    try {
      await this.tablesDB.deleteRow({
        databaseId: conf.appwriteDatabaseId,
        tableId: conf.appwriteCollectionId,
        rowId: slug,
      });

      return true;
    } catch (error) {
      console.log("Appwrite Service :: deletePost :: error", error);
      return false;
    }
  }

  // Get Single Post
  async getPost(slug) {
    try {
      return await this.tablesDB.getRow({
        databaseId: conf.appwriteDatabaseId,
        tableId: conf.appwriteCollectionId,
        rowId: slug,
      });
    } catch (error) {
      console.log("Appwrite Service :: getPost :: error", error);
      return null;
    }
  }

  // Get All Posts
async getPosts(queries = []) {
    try {
      return await this.tablesDB.listRows({
        databaseId: conf.appwriteDatabaseId,
        tableId: conf.appwriteCollectionId,
        queries,
      });
    } catch (error) {
      console.log("Appwrite Service :: getPosts :: error", error);
      return null;
    }
  }

  // Upload File
  async uploadFile(file) {
    try {
      return await this.bucket.createFile({
        bucketId: conf.appwriteBucketId,
        fileId: ID.unique(),
        file,
      });
    } catch (error) {
      console.log("Appwrite Service :: uploadFile :: error", error);
      return null;
    }
  }

  // Delete File
  async deleteFile(fileId) {
    try {
      await this.bucket.deleteFile({
        bucketId: conf.appwriteBucketId,
        fileId,
      });

      return true;
    } catch (error) {
      console.log("Appwrite Service :: deleteFile :: error", error);
      return false;
    }
  }

  // Preview File
  getFilePreview(fileId) {
    return this.bucket.getFileView({
      bucketId: conf.appwriteBucketId,
      fileId,
    });
  }
}

const services = new Services();

export default services;