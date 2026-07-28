import React, { useEffect, useState, useCallback, useRef } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import appwriteService from "../appwrite/config";
import socialService from "../appwrite/social";
import conf from "../conf/conf";
import { Container, PostCard } from "../components";
import TextType from "../components/TextType/TextType";
import usePollingPosts from "../hooks/usePollingPosts";

function Home() {
  const [posts, setPosts] = useState([]);
  const [trendingPosts, setTrendingPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const authStatus = useSelector((state) => state.auth.status);

  // Track whether this is the very first load (show skeleton) or a background poll (silent update).
  const isFirstLoadRef = useRef(true);
  // Keep a JSON snapshot of the previous posts + trending to avoid unnecessary setState calls.
  const prevSnapshotRef = useRef("");

  // Memoize the fetch function so it can be passed to the polling hook by reference.
  const fetchPosts = useCallback(async () => {
    if (!authStatus) {
      setPosts([]);
      setTrendingPosts([]);
      setIsLoading(false);
      return;
    }

    // Only show the loading skeleton during the very first fetch.
    if (isFirstLoadRef.current) {
      setIsLoading(true);
    }

    try {
      const response = await appwriteService.getPosts();

      if (response && response.rows) {
        const activePosts = response.rows.filter(p => p.status === "active");

        // Calculate Trending Posts (top 5)
        let computedTrending = [];
        if (activePosts.length > 0) {
          // Check if DB contains pre-calculated aggregate counters
          if ("likesCount" in activePosts[0] && "viewsCount" in activePosts[0]) {
            computedTrending = [...activePosts]
              .sort((a, b) => (b.likesCount - a.likesCount) || (b.viewsCount - a.viewsCount))
              .slice(0, 5);
          } else {
            // Fallback: Fetch Likes and Views records and aggregate counts
            try {
              const [likesRes, viewsRes] = await Promise.all([
                socialService.listRows(conf.appwriteLikesTableId, []),
                socialService.listRows(conf.appwriteViewsTableId, []),
              ]);

              const likesRows = likesRes?.rows || [];
              const viewsRows = viewsRes?.rows || [];

              const likesMap = {};
              const viewsMap = {};

              likesRows.forEach(row => {
                likesMap[row.postId] = (likesMap[row.postId] || 0) + 1;
              });

              viewsRows.forEach(row => {
                viewsMap[row.postId] = (viewsMap[row.postId] || 0) + 1;
              });

              computedTrending = activePosts.map(post => ({
                ...post,
                likesCount: likesMap[post.$id] || 0,
                viewsCount: viewsMap[post.$id] || 0,
              }))
              .sort((a, b) => (b.likesCount - a.likesCount) || (b.viewsCount - a.viewsCount))
              .slice(0, 5);
            } catch (err) {
              console.error("Failed to compute trending posts fallback", err);
              // Muted fallback
              computedTrending = activePosts.slice(0, 5);
            }
          }
        }

        // Build a snapshot string to compare against the previous one.
        // Only update state when the data has actually changed.
        const newSnapshot = JSON.stringify({ posts: activePosts, trending: computedTrending });
        if (newSnapshot !== prevSnapshotRef.current) {
          prevSnapshotRef.current = newSnapshot;
          setPosts(activePosts);
          setTrendingPosts(computedTrending);
        }
      } else {
        const emptySnapshot = JSON.stringify({ posts: [], trending: [] });
        if (emptySnapshot !== prevSnapshotRef.current) {
          prevSnapshotRef.current = emptySnapshot;
          setPosts([]);
          setTrendingPosts([]);
        }
      }
    } catch {
      const emptySnapshot = JSON.stringify({ posts: [], trending: [] });
      if (emptySnapshot !== prevSnapshotRef.current) {
        prevSnapshotRef.current = emptySnapshot;
        setPosts([]);
        setTrendingPosts([]);
      }
    } finally {
      if (isFirstLoadRef.current) {
        isFirstLoadRef.current = false;
        setIsLoading(false);
      }
    }
  }, [authStatus]);

  // Poll every 10 seconds. Only poll when the user is authenticated.
  usePollingPosts(fetchPosts, 10000, !!authStatus);

  if (!authStatus) {
    return (
      <div className="w-full py-12 md:py-16">
        <Container>
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm font-medium uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
              Welcome to StoryNest
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-white md:text-4xl">
              Your{" "}
              <TextType
                texts={[
                  "stories, beautifully organized.",
                  "ideas, shared with everyone.",
                  "thoughts, brought to life.",
                  "writing, made memorable.",
                ]}
                typingSpeed={70}
                deletingSpeed={35}
                pauseDuration={1800}
                showCursor={true}
                cursorCharacter="|"
                loop={true}
              />
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base text-slate-600 dark:text-slate-300">
              Sign in to explore posts, publish your ideas, and manage your personal writing space.
            </p>
            <Link
              to="/login"
              className="mt-8 inline-flex rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-indigo-500/30 dark:bg-indigo-500/20 dark:text-indigo-200 dark:focus:ring-indigo-400 dark:focus:ring-offset-slate-950"
            >
              Login to read posts
            </Link>
          </section>
        </Container>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full py-8 md:py-12">
        <Container>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, index) => (
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
        </Container>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="w-full py-12 md:py-16">
        <Container>
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm font-medium uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
              Content Library
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-white md:text-4xl">
              No posts available yet
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base text-slate-600 dark:text-slate-300">
              Start sharing your thoughts by creating your first post from the Add Post page.
            </p>
            <div className="mt-8 inline-flex rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              No Posts Available
            </div>
          </section>
        </Container>
      </div>
    );
  }

  return (
    <div className="w-full py-8 md:py-12">
      <Container>
        {/* Trending Section */}
        {trendingPosts.length > 0 && (
          <section className="mb-12">
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2 mb-6">
              <span>🔥</span> Trending on StoryNest
            </h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
              {trendingPosts.map((post, idx) => (
                <div key={post.$id} className="relative flex flex-col justify-between rounded-2xl border border-slate-100 bg-slate-50/50 p-5 transition hover:shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
                  <div>
                    <span className="text-3xl font-extrabold text-slate-200 dark:text-slate-800 absolute right-4 top-2 select-none">
                      0{idx + 1}
                    </span>
                    <Link to={`/all-posts?category=${encodeURIComponent(post.category || "General")}`} className="inline-block rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-650 dark:bg-indigo-950/30 dark:text-indigo-350">
                      {post.category || "General"}
                    </Link>
                    <h3 className="mt-3 text-sm font-bold leading-snug text-slate-900 dark:text-white line-clamp-2 hover:text-indigo-600 transition">
                      <Link to={`/post/${post.$id}`}>{post.title}</Link>
                    </h3>
                  </div>
                  <div className="mt-5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span>@{post.authorUsername || "writer"}</span>
                    <span className="flex items-center gap-1">
                      <span>♥</span> {post.likesCount || 0}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-8">
          <p className="text-sm font-medium uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
            Latest Stories
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white md:text-4xl">
            Discover fresh insights from the community
          </h1>
          <p className="mt-3 max-w-3xl text-base text-slate-600 dark:text-slate-300">
            Explore curated posts, practical ideas, and meaningful stories from writers on StoryNest.
          </p>
        </section>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {posts.map((post) => (
            <div key={post.$id} className="w-full">
              <PostCard {...post} />
            </div>
          ))}
        </div>
      </Container>
    </div>
  );
}

export default Home;