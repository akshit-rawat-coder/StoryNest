import { Client, ID, Query, Storage, TablesDB } from "appwrite";
import conf from "../conf/conf";

const PROFILE_TABLE_ID = "profiles";

class ProfileService {
  constructor() {
    this.client = new Client();
    this.client.setEndpoint(conf.appwriteUrl).setProject(conf.appwriteProjectId);
    this.tablesDB = new TablesDB(this.client);
    this.storage = new Storage(this.client);
  }

  async getProfile(userId) {
    const response = await this.tablesDB.listRows({
      databaseId: conf.appwriteDatabaseId,
      tableId: PROFILE_TABLE_ID,
      queries: [Query.equal("userId", userId)],
    });
    return response.rows?.[0] || null;
  }

  async createProfile({ userId, username }) {
    return this.tablesDB.createRow({
      databaseId: conf.appwriteDatabaseId,
      tableId: PROFILE_TABLE_ID,
      rowId: userId,
      data: { userId, username, bio: "", website: "", github: "", linkedin: "", avatar: "" },
    });
  }

  async getOrCreateProfile(user) {
    const existingProfile = await this.getProfile(user.$id);
    if (existingProfile) return existingProfile;

    const baseUsername = (user.name || user.email?.split("@")[0] || "writer")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 30) || "writer";

    // Check if the base username is already taken
    let username = baseUsername;
    let suffix = 1;
    while (!(await this.isUsernameAvailable(username, user.$id))) {
      username = `${baseUsername}${suffix}`.slice(0, 50);
      suffix++;
    }

    try {
      return await this.createProfile({ userId: user.$id, username });
    } catch (error) {
      // A second open tab can create the same profile first.
      if (error?.code === 409) {
        const profile = await this.getProfile(user.$id);
        if (profile) return profile;
      }
      throw error;
    }
  }

  async updateProfile(userId, data) {
    return this.tablesDB.updateRow({
      databaseId: conf.appwriteDatabaseId,
      tableId: PROFILE_TABLE_ID,
      rowId: userId,
      data,
    });
  }

  async isUsernameAvailable(username, currentUserId) {
    const response = await this.tablesDB.listRows({
      databaseId: conf.appwriteDatabaseId,
      tableId: PROFILE_TABLE_ID,
      queries: [Query.equal("username", username)],
    });
    return !(response.rows || []).some((profile) => profile.userId !== currentUserId);
  }

  async getProfileByUsername(username) {
    const response = await this.tablesDB.listRows({
      databaseId: conf.appwriteDatabaseId,
      tableId: PROFILE_TABLE_ID,
      queries: [Query.equal("username", username)],
    });
    return response.rows?.[0] || null;
  }

  async uploadAvatar(file) {
    return this.storage.createFile({
      bucketId: conf.appwriteBucketId,
      fileId: ID.unique(),
      file,
    });
  }

  async deleteAvatar(fileId) {
    if (!fileId) return;
    return this.storage.deleteFile({ bucketId: conf.appwriteBucketId, fileId });
  }

  getAvatarUrl(fileId) {
    return fileId ? this.storage.getFileView({ bucketId: conf.appwriteBucketId, fileId }) : null;
  }
}

export default new ProfileService();
