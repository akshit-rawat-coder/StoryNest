import React, { useEffect, useMemo, useState } from "react";
import { ThreeDot } from "react-loading-indicators";
import { Query } from "appwrite";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import appwriteService from "../appwrite/config";
import profileService from "../appwrite/profile";
import socialService from "../appwrite/social";
import { Container, PostCard } from "../components";

const formatJoinDate = (date) =>
  date
    ? new Date(date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : "Recently joined";

function StatCard({ label, value, loading = false }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      {loading ? (
        <div className="mt-2">
          <ThreeDot color="#6366F1" size="small" />
        </div>
      ) : (
        <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{value}</p>
      )}
    </div>
  );
}

function PublicProfile() {
  const { username } = useParams();
  const navigate = useNavigate();
  const loggedInUser = useSelector((state) => state.auth.userData);
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [totalLikes, setTotalLikes] = useState(0);
  const [totalViews, setTotalViews] = useState(0);
  const [isStatsLoading, setIsStatsLoading] = useState(false);

  // Check if this is the logged-in user's own profile
  const isOwnProfile =
    profile && loggedInUser ? profile.userId === loggedInUser.$id : false;

  useEffect(() => {
    if (!username) {
      navigate("/", { replace: true });
      return;
    }
    let mounted = true;
    const loadPublicProfile = async () => {
      setIsLoading(true);
      setError("");
      setProfile(null);
      setPosts([]);
      try {
        const nextProfile = await profileService.getProfileByUsername(username);
        if (!mounted) return;
        if (!nextProfile) {
          setError("not-found");
          return;
        }
        setProfile(nextProfile);

        // Fetch this user's posts
        const postsResponse = await appwriteService.getPosts([
          Query.equal("userId", nextProfile.userId),
        ]);
        if (mounted) {
          const allPosts = postsResponse?.rows || [];
          setPosts(allPosts);
        }
      } catch (err) {
        if (mounted) {
          setError(err?.message || "We could not load this profile. Please try again.");
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    loadPublicProfile();
    return () => {
      mounted = false;
    };
  }, [username, navigate]);

  const activePosts = useMemo(
    () => posts.filter((post) => post.status === "active"),
    [posts]
  );

  // Fetch aggregated likes and views
  useEffect(() => {
    if (activePosts.length === 0) {
      setTotalLikes(0);
      setTotalViews(0);
      return;
    }
    let mounted = true;
    const fetchStats = async () => {
      setIsStatsLoading(true);
      try {
        const postIds = activePosts.map((p) => p.$id);
        const [likes, views] = await Promise.all([
          socialService.getTotalLikesForPosts(postIds),
          socialService.getTotalViewsForPosts(postIds),
        ]);
        if (mounted) {
          setTotalLikes(likes);
          setTotalViews(views);
        }
      } catch {
        if (mounted) {
          setTotalLikes(0);
          setTotalViews(0);
        }
      } finally {
        if (mounted) setIsStatsLoading(false);
      }
    };
    fetchStats();
    return () => {
      mounted = false;
    };
  }, [activePosts]);

  // Handle "not found"
  if (!isLoading && error === "not-found") {
    return (
      <div className="w-full py-16 md:py-24">
        <Container>
          <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-4xl dark:bg-slate-800">
              <span className="text-slate-400 dark:text-slate-500">?</span>
            </div>
            <h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Profile not found
            </h1>
            <p className="mt-3 text-base text-slate-600 dark:text-slate-300">
              We couldn&apos;t find a profile with the username{" "}
              <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                @{username}
              </span>
              . The author may have changed their username or the link may be
              incorrect.
            </p>
            <Link
              to="/"
              className="mt-8 inline-flex min-h-10 items-center justify-center rounded-xl bg-indigo-600 px-6 py-2 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950"
            >
              Back to Home
            </Link>
          </div>
        </Container>
      </div>
    );
  }

  // Handle other errors
  if (!isLoading && error) {
    return (
      <div className="w-full py-16 md:py-24">
        <Container>
          <div className="mx-auto max-w-lg rounded-2xl border border-red-200 bg-red-50 p-10 text-center dark:border-red-500/30 dark:bg-red-500/10">
            <p className="text-sm text-red-700 dark:text-red-200">{error}</p>
            <Link
              to="/"
              className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl bg-indigo-600 px-6 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
            >
              Back to Home
            </Link>
          </div>
        </Container>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="w-full py-16 md:py-24">
        <Container>
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col items-center gap-4">
              <ThreeDot color="#6366F1" size="medium" />
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Loading profile...
              </p>
            </div>
          </div>
        </Container>
      </div>
    );
  }

  if (!profile) return null;

  const profileName = profile.username || "StoryNest writer";
  const socialLinks = [
    ["Website", profile.website],
    ["GitHub", profile.github],
    ["LinkedIn", profile.linkedin],
  ].filter(([, url]) => url);

  return (
    <div className="py-8 md:py-12">
      <Container>
        <div className="space-y-6">
          {/* Profile Header Card */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="h-24 bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 md:h-32" />
            <div className="px-5 pb-6 md:px-8">
              <div className="-mt-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex items-end gap-4">
                  <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-indigo-600 text-3xl font-semibold text-white shadow-md dark:border-slate-900">
                    {profile.avatar ? (
                      <img
                        src={profileService.getAvatarUrl(profile.avatar)}
                        alt={`${profile.username}'s avatar`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      profileName.trim().charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="pb-1">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                      @{profile.username}
                    </h1>
                    {profile.bio && (
                      <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                        {profile.bio}
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Member since{" "}
                  {profile.$createdAt
                    ? formatJoinDate(profile.$createdAt)
                    : "Recently joined"}
                </p>
              </div>

              {socialLinks.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {socialLinks.map(([label, url]) => (
                    <a
                      key={label}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-indigo-700 transition hover:bg-indigo-50 dark:border-slate-700 dark:text-indigo-300 dark:hover:bg-slate-800"
                    >
                      {label}
                    </a>
                  ))}
                </div>
              )}

              {isOwnProfile && (
                <p className="mt-4 text-xs text-indigo-600 dark:text-indigo-400">
                  This is you.{" "}
                  <Link
                    to="/profile"
                    className="font-medium underline hover:text-indigo-700 dark:hover:text-indigo-300"
                  >
                    Go to your profile settings
                  </Link>
                </p>
              )}
            </div>
          </section>

          {/* Stats Cards */}
          <section
            className="grid grid-cols-2 gap-4 md:grid-cols-4"
            aria-label="Profile statistics"
          >
            <StatCard label="Total Posts" value={activePosts.length} />
            <StatCard label="Drafts" value={posts.length - activePosts.length} />
            <StatCard
              label="❤️ Likes"
              value={totalLikes.toLocaleString()}
              loading={isStatsLoading}
            />
            <StatCard
              label="👁 Views"
              value={totalViews.toLocaleString()}
              loading={isStatsLoading}
            />
          </section>

          {/* Recent Published Posts */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-8">
            <div className="mb-6">
              <p className="text-sm font-medium uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
                Published Stories
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Recent posts by @{profile.username}
              </h2>
            </div>
            {activePosts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-800/50">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  No published stories yet.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {activePosts.map((post) => (
                  <div key={post.$id} className="w-full">
                    <PostCard {...post} />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </Container>
    </div>
  );
}

export default PublicProfile;

