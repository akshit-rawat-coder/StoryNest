const conf = {
    appwriteUrl: String(import.meta.env.VITE_APPWRITE_URL),
    appwriteProjectId: String(import.meta.env.VITE_APPWRITE_PROJECT_ID),
    appwriteCollectionId: String(import.meta.env.VITE_APPWRITE_COLLECTION_ID),
    appwriteBucketId: String(import.meta.env.VITE_APPWRITE_BUCKET_ID),
    appwriteDatabaseId: String(import.meta.env.VITE_APPWRITE_DATABASE_ID),
    appwriteLikesTableId: String(import.meta.env.VITE_APPWRITE_LIKES_TABLE_ID || "post_likes"),
    appwriteCommentsTableId: String(import.meta.env.VITE_APPWRITE_COMMENTS_TABLE_ID || "post_comments"),
    appwriteBookmarksTableId: String(import.meta.env.VITE_APPWRITE_BOOKMARKS_TABLE_ID || "post_bookmarks"),
    appwriteViewsTableId: String(import.meta.env.VITE_APPWRITE_VIEWS_TABLE_ID || "post_views"),
}

 export default conf
