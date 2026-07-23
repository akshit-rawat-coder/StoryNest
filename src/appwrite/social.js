import { Client, ID, Permission, Query, Role, TablesDB } from "appwrite";
import conf from "../conf/conf";

class SocialService {
  constructor() {
    this.client = new Client();
    this.client.setEndpoint(conf.appwriteUrl).setProject(conf.appwriteProjectId);
    this.tablesDB = new TablesDB(this.client);
  }

  listRows(tableId, queries, total = false) {
    return this.tablesDB.listRows({ databaseId: conf.appwriteDatabaseId, tableId, queries, total });
  }

  async getUserLike(postId, userId) {
    const response = await this.listRows(conf.appwriteLikesTableId, [Query.equal("postId", postId), Query.equal("userId", userId)]);
    return response.rows?.[0] || null;
  }

  async toggleLike(postId, userId) {
    const like = await this.getUserLike(postId, userId);
    if (like) {
      await this.tablesDB.deleteRow({ databaseId: conf.appwriteDatabaseId, tableId: conf.appwriteLikesTableId, rowId: like.$id });
      return false;
    }
    try {
      await this.tablesDB.createRow({
        databaseId: conf.appwriteDatabaseId,
        tableId: conf.appwriteLikesTableId,
        rowId: ID.unique(),
        data: { postId, userId },
      });
      return true;
    } catch (error) {
      if (error?.code === 409) return true;
      throw error;
    }
  }

  async getLikeCount(postId) {
    const response = await this.listRows(
      conf.appwriteLikesTableId,
      [Query.equal("postId", postId)],
      true
    );
    return response.total ?? response.rows?.length ?? 0;
  }

  async getUserBookmark(postId, userId) {
    const response = await this.listRows(conf.appwriteBookmarksTableId, [Query.equal("postId", postId), Query.equal("userId", userId)]);
    return response.rows?.[0] || null;
  }

  async toggleBookmark(postId, userId) {
    const bookmark = await this.getUserBookmark(postId, userId);
    if (bookmark) {
      await this.tablesDB.deleteRow({ databaseId: conf.appwriteDatabaseId, tableId: conf.appwriteBookmarksTableId, rowId: bookmark.$id });
      return false;
    }
    try {
      await this.tablesDB.createRow({
        databaseId: conf.appwriteDatabaseId,
        tableId: conf.appwriteBookmarksTableId,
        rowId: ID.unique(),
        data: { postId, userId },
      });
      return true;
    } catch (error) {
      if (error?.code === 409) return true;
      throw error;
    }
  }

  async getComments(postId) {
    const response = await this.listRows(conf.appwriteCommentsTableId, [Query.equal("postId", postId), Query.orderDesc("$createdAt")]);
    return response.rows || [];
  }

  createComment({ postId, userId, authorName, content }) {
    return this.tablesDB.createRow({
      databaseId: conf.appwriteDatabaseId,
      tableId: conf.appwriteCommentsTableId,
      rowId: ID.unique(),
      data: { postId, userId, authorName, content },
      permissions: [Permission.read(Role.users()), Permission.update(Role.user(userId)), Permission.delete(Role.user(userId))],
    });
  }

  updateComment(commentId, content) {
    return this.tablesDB.updateRow({ databaseId: conf.appwriteDatabaseId, tableId: conf.appwriteCommentsTableId, rowId: commentId, data: { content } });
  }

  deleteComment(commentId) {
    return this.tablesDB.deleteRow({ databaseId: conf.appwriteDatabaseId, tableId: conf.appwriteCommentsTableId, rowId: commentId });
  }

  async getViewCount(postId) {
    const response = await this.listRows(conf.appwriteViewsTableId, [Query.equal("postId", postId)], true);
    return response.total ?? response.rows?.length ?? 0;
  }

  async getTotalLikesForPosts(postIds) {
    if (!postIds || postIds.length === 0) return 0;
    const response = await this.listRows(
      conf.appwriteLikesTableId,
      [Query.equal("postId", postIds)],
      true
    );
    return response.total ?? 0;
  }

  async getTotalViewsForPosts(postIds) {
    if (!postIds || postIds.length === 0) return 0;
    const response = await this.listRows(
      conf.appwriteViewsTableId,
      [Query.equal("postId", postIds)],
      true
    );
    return response.total ?? 0;
  }

  recordView(postId, viewerId = "") {
    return this.tablesDB.createRow({
      databaseId: conf.appwriteDatabaseId,
      tableId: conf.appwriteViewsTableId,
      rowId: ID.unique(),
      data: { postId, viewerId },
    });
  }
}

export default new SocialService();
