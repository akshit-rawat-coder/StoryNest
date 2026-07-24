import conf from "../conf/conf";

import { Client, Account, ID } from "appwrite";

export class AuthService {
  client = new Client();
  account;

  constructor() {
    this.client
      .setEndpoint(conf.appwriteUrl)
      .setProject(conf.appwriteProjectId);
    this.account = new Account(this.client);
  }

async createAccount({ email, password, name }) {
  const userAccount = await this.account.create(
    ID.unique(),
    email,
    password,
    name
  );

  if (userAccount) {

    // Login first
    await this.account.createEmailPasswordSession({
      email,
      password,
    });

    // Send verification mail
    await this.sendVerificationEmail();

    // Logout
    await this.logout();
  }

  return userAccount;
}

  async sendVerificationEmail() {
    const url = window.location.origin + "/verify-email";
    return await this.account.createVerification(url);
  }

  async updateVerification(userId, secret) {
    return await this.account.updateVerification(userId, secret);
  }

  async login({ email, password }) {
    return await this.account.createEmailPasswordSession({
      email,
      password,
    });
  }

  async deleteSession() {
    try {
      await this.account.deleteSession("current");
    } catch (error) {
      console.log("Appwrite service :: deleteSession :: error", error);
    }
  }

  async getCurrentUser() {
    try {
      return await this.account.get();
    } catch (error) {
      console.log("Appwrite servie :: getCurrentUser :: error", error);
    }
    return null;
  }

  async logout() {
    try {
      await this.account.deleteSessions();
    } catch (error) {
      console.log("Appwrite servie :: logout :: error", error);
    }
  }
}

const authService = new AuthService();
export default authService;
