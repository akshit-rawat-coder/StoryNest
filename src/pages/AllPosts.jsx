import React, { useState, useEffect } from "react";
import { Container, PostCard } from "../components";
import appwriteService from "../appwrite/config";
import { useSearchParams } from "react-router-dom";

const CATEGORIES = [
  "React",
  "JavaScript",
  "TypeScript",
  "HTML",
  "CSS",
  "Tailwind CSS",
  "Node.js",
  "Express",
  "MongoDB",
  "PostgreSQL",
  "Appwrite",
  "AI",
  "Career",
  "DevOps",
  "General"
];

function AllPosts() {
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentPage, setCurrentPage] = useState(1);
  const postsPerPage = 12;

  const categoryFilter = searchParams.get("category") || "all";
  const tagFilter = searchParams.get("tag") || "";

  useEffect(() => {
    setIsLoading(true);
    appwriteService.getPosts().then((response) => {
      if (response) {
        setPosts(response.rows || []);
      }
      setIsLoading(false);
    });
  }, []);

  // Reset to page 1 when any filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [categoryFilter, tagFilter, searchQuery]);

  const handleCategoryChange = (e) => {
    const nextCategory = e.target.value;
    const nextParams = {};
    if (nextCategory && nextCategory !== "all") {
      nextParams.category = nextCategory;
    }
    if (tagFilter) {
      nextParams.tag = tagFilter;
    }
    setSearchParams(nextParams);
  };

  const filteredPosts = posts.filter((post) => {
    // Only show active posts
    if (post.status !== "active") return false;

    // Filter by Category
    if (categoryFilter !== "all" && post.category !== categoryFilter) return false;

    // Filter by Tag
    if (tagFilter) {
      const tagsList = post.tags
        ? (typeof post.tags === "string" ? post.tags.split(",").map(t => t.trim().toLowerCase()) : (Array.isArray(post.tags) ? post.tags.map(t => t.toLowerCase()) : []))
        : [];
      if (!tagsList.includes(tagFilter.toLowerCase())) return false;
    }

    // Filter by Search Query
    if (searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase().trim();
      const author = post.authorUsername || "";
      const matchesTitle = post.title?.toLowerCase().includes(query);
      const matchesContent = post.content?.toLowerCase().includes(query);
      const matchesAuthor = author.toLowerCase().includes(query);
      return matchesTitle || matchesContent || matchesAuthor;
    }

    return true;
  });

  // Calculate paginated posts
  const totalPages = Math.ceil(filteredPosts.length / postsPerPage);
  const indexOfLastPost = currentPage * postsPerPage;
  const indexOfFirstPost = indexOfLastPost - postsPerPage;
  const currentPosts = filteredPosts.slice(indexOfFirstPost, indexOfLastPost);

  return (
    <div className="w-full py-8 md:py-12">
      <Container>
        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-8">
          <p className="text-sm font-medium uppercase tracking-wide text-indigo-600 dark:text-indigo-300">All Posts</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white md:text-4xl">
            Explore every story in one place
          </h1>
          <p className="mt-3 max-w-3xl text-base text-slate-600 dark:text-slate-300">
            Discover articles from the StoryNest community. Use search and filters to quickly find the content you need.
          </p>
        </section>

        {tagFilter && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2 text-sm text-indigo-750 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-200">
            <span>Showing posts with tag: <strong>#{tagFilter}</strong></span>
            <button
              onClick={() => {
                const nextParams = {};
                if (categoryFilter && categoryFilter !== "all") {
                  nextParams.category = categoryFilter;
                }
                setSearchParams(nextParams);
              }}
              className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-200 hover:bg-indigo-300 text-indigo-850 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-250 font-bold"
              title="Clear tag filter"
            >
              &times;
            </button>
          </div>
        )}

        <section className="mb-6 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:grid-cols-3 md:p-5">
          <div className="md:col-span-2">
            <label htmlFor="all-posts-search" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Search
            </label>
            <input
              id="all-posts-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search posts by title, content, or author..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition duration-200 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-indigo-400 dark:focus:ring-indigo-400/25"
            />
          </div>
          <div>
            <label htmlFor="all-posts-category" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Category
            </label>
            <select
              id="all-posts-category"
              value={categoryFilter}
              onChange={handleCategoryChange}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition duration-200 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:bg-slate-950 dark:focus:ring-indigo-400/25"
            >
              <option value="all">All Categories</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </section>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[...Array(8)].map((_, index) => (
              <div
                key={index}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="mb-4 aspect-video w-full animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
                <div className="h-4 w-4/5 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                <div className="mt-3 h-3 w-1/3 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              </div>
            ))}
          </div>
        ) : currentPosts.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">No posts available</h2>
            <p className="mx-auto mt-3 max-w-xl text-slate-600 dark:text-slate-300">
              It looks quiet right now. Once posts are published, they will appear here.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {currentPosts.map((post) => (
                <div key={post.id || post.$id} className="w-full">
                  <PostCard {...post} />
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-12 flex items-center justify-center gap-2">
                <button
                  onClick={() => {
                    setCurrentPage(p => Math.max(1, p - 1));
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  disabled={currentPage === 1}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-850"
                >
                  Previous
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                  <button
                    key={pageNum}
                    onClick={() => {
                      setCurrentPage(pageNum);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-sm font-medium transition ${
                      currentPage === pageNum
                        ? "bg-indigo-600 text-white shadow-sm hover:bg-indigo-700"
                        : "border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-850"
                    }`}
                  >
                    {pageNum}
                  </button>
                ))}

                <button
                  onClick={() => {
                    setCurrentPage(p => Math.min(totalPages, p + 1));
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  disabled={currentPage === totalPages}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-850"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </Container>
    </div>
  );
}

export default AllPosts;