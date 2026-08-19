import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ThreeDot } from "react-loading-indicators";
import { Query } from "appwrite";
import { Link, useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import appwriteService from "../appwrite/config";
import profileService from "../appwrite/profile";
import socialService from "../appwrite/social";
import { Container, PostCard, Loader } from "../components";
import ProfileAvatar from "../components/profile/ProfileAvatar";
import ProfileForm from "../components/profile/ProfileForm";
import ProfileSkeleton from "../components/profile/ProfileSkeleton";

const TAB_OPTIONS = ["posts", "drafts", "bookmarks"];

const formatJoinDate = (date) =>
  date
    ? new Date(date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : "Recently joined";

function Notice({ children, tone = "error" }) {
  const tones = {
    error: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200",
    success:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200",
  };
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}
    >
      {children}
    </div>
  );
}

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

function EmptyPosts({ draft = false }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{draft ? "No drafts yet" : "Your stories will appear here"}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-300">
        {draft ? "Save a post as inactive to keep working on it here." : "Share your first idea and start building your StoryNest."}
      </p>
      {!draft && <Link to="/add-post" className="mt-5 inline-flex min-h-10 items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950">Create your first post</Link>}
    </div>
  );
}

function Profile() {
  const user = useSelector((state) => state.auth.userData);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTab = TAB_OPTIONS.includes(searchParams.get("tab")) ? searchParams.get("tab") : "posts";
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [avatarFile, setAvatarFile] = useState(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [totalLikes, setTotalLikes] = useState(0);
  const [totalViews, setTotalViews] = useState(0);
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [bookmarkedPosts, setBookmarkedPosts] = useState([]);
  const [isBookmarksLoading, setIsBookmarksLoading] = useState(false);
  const [bookmarksError, setBookmarksError] = useState(false);

  useEffect(() => {
    if (!user?.$id) return;
    let mounted = true;
    const loadProfile = async () => {
      setIsLoading(true);
      setError("");
      try {
        const [nextProfile, postsResponse] = await Promise.all([
          profileService.getOrCreateProfile(user),
          appwriteService.getPosts([Query.equal("userId", user.$id)]),
        ]);
        if (mounted) {
          setProfile(nextProfile);
          setPosts(postsResponse?.rows || []);
          window.dispatchEvent(new CustomEvent("storynest:profile-updated", { detail: nextProfile }));
        }
      } catch (loadError) {
        if (mounted) setError(loadError?.message || "We could not load your profile. Please try again.");
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    loadProfile();
    return () => { mounted = false; };
  }, [user]);

  const activePosts = useMemo(() => posts.filter((post) => post.status === "active"), [posts]);
  const drafts = useMemo(() => posts.filter((post) => post.status === "inactive"), [posts]);

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
    return () => { mounted = false; };
  }, [activePosts]);

  const loadBookmarks = useCallback(async () => {
    if (!user?.$id) return;
    setIsBookmarksLoading(true);
    setBookmarksError(false);
    try {
      const bookmarks = await socialService.getUserBookmarks(user.$id);
      const postIds = bookmarks.map((b) => b.postId).filter(Boolean);
      const postsData = [];
      for (const postId of postIds) {
        try {
          const post = await appwriteService.getPost(postId);
          if (post && post.status === "active" && !postsData.some((p) => p.$id === post.$id)) {
            postsData.push(post);
          }
        } catch (err) {
          // Skip deleted/unavailable posts instead of breaking the bookmarks page.
          console.warn("Skipping unavailable bookmarked post", postId, err);
        }
      }
      setBookmarkedPosts(postsData);
    } catch (err) {
      console.error("Failed to load bookmarks", err);
      setBookmarksError(true);
    } finally {
      setIsBookmarksLoading(false);
    }
  }, [user?.$id]);

  useEffect(() => {
    if (selectedTab !== "bookmarks" || !user?.$id) return;
    const handleBookmarksUpdated = () => { loadBookmarks(); };
    loadBookmarks();
    window.addEventListener("storynest:bookmarks-updated", handleBookmarksUpdated);
    return () => {
      window.removeEventListener("storynest:bookmarks-updated", handleBookmarksUpdated);
    };
  }, [selectedTab, user?.$id, loadBookmarks]);

  const handleAvatarFile = (file) => {
    setError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file for your profile photo.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Profile photos must be 5 MB or smaller.");
      return;
    }
    setAvatarFile(file);
    setRemoveAvatar(false);
  };

  const handleAvatarRemove = () => {
    setAvatarFile(null);
    setRemoveAvatar(Boolean(profile?.avatar));
  };

  const handleSave = async (formData) => {
    if (!profile || !user?.$id) return;
    setError("");
    setSuccess("");
    setIsSaving(true);
    let uploadedAvatarId = null;
    try {
      const username = formData.username.trim();
      const isAvailable = await profileService.isUsernameAvailable(username, user.$id);
      if (!isAvailable) throw new Error("That username is already in use. Please choose another one.");

      let avatar = profile.avatar || "";
      if (avatarFile) {
        const uploadedAvatar = await profileService.uploadAvatar(avatarFile);
        uploadedAvatarId = uploadedAvatar.$id;
        avatar = uploadedAvatarId;
      } else if (removeAvatar) {
        avatar = "";
      }

      const updatedProfile = await profileService.updateProfile(user.$id, {
        username,
        bio: formData.bio.trim(),
        website: formData.website.trim(),
        github: formData.github.trim(),
        linkedin: formData.linkedin.trim(),
        avatar,
      });

      if (profile.avatar && profile.avatar !== avatar) {
        try {
          await profileService.deleteAvatar(profile.avatar);
        } catch {
          // The new profile is already saved; retain a non-blocking warning instead of reverting it.
          setError("Profile saved, but the old avatar could not be removed.");
        }
      }

      setProfile(updatedProfile);
      setAvatarFile(null);
      setRemoveAvatar(false);
      setSuccess("Your profile has been saved.");
      window.dispatchEvent(new CustomEvent("storynest:profile-updated", { detail: updatedProfile }));
    } catch (saveError) {
      if (uploadedAvatarId) {
        try { await profileService.deleteAvatar(uploadedAvatarId); } catch { /* Avoid masking the primary save error. */ }
      }
      if (saveError?.code === 409) {
        setError("That username is already in use. Please choose another one.");
      } else {
        setError(saveError?.message || "We could not save your profile. Please try again.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const setTab = (tab) => setSearchParams(tab === "posts" ? {} : { tab });

  if (isLoading) {
    return <div className="py-8 md:py-12"><Container><ProfileSkeleton /></Container></div>;
  }

  if (!profile) {
    return <div className="py-8 md:py-12"><Container><Notice>{error || "Your profile is unavailable right now."}</Notice></Container></div>;
  }

  const profileName = user?.name || profile.username || user?.email || "StoryNest writer";
  const socialLinks = [
    ["Website", profile.website], ["GitHub", profile.github], ["LinkedIn", profile.linkedin],
  ].filter(([, url]) => url);

  return (
    <div className="py-8 md:py-12">
      <Container>
        <div className="space-y-6">
          {error && <Notice>{error}</Notice>}
          {success && <Notice tone="success">{success}</Notice>}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="h-24 bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 md:h-32" />
            <div className="px-5 pb-6 md:px-8">
              <div className="-mt-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex items-end gap-4">
                  <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-indigo-600 text-3xl font-semibold text-white shadow-md dark:border-slate-900">
                    {profile.avatar ? <img src={profileService.getAvatarUrl(profile.avatar)} alt={`${profile.username}'s avatar`} className="h-full w-full object-cover" /> : profileName.trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="pb-1">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{profileName}</h1>
                    <p className="text-sm text-slate-600 dark:text-slate-300">@{profile.username}</p>
                  </div>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Member since {formatJoinDate(user?.$createdAt)}</p>
              </div>
              <div className="mt-5 grid gap-3 text-sm text-slate-600 dark:text-slate-300 md:grid-cols-[minmax(0,1fr)_auto]">
                <div>
                  <p>{user?.email}</p>
                  {profile.bio && <p className="mt-2 max-w-2xl leading-6">{profile.bio}</p>}
                </div>
                {socialLinks.length > 0 && <div className="flex flex-wrap gap-2 md:justify-end">{socialLinks.map(([label, url]) => <a key={label} href={url} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-indigo-700 transition hover:bg-indigo-50 dark:border-slate-700 dark:text-indigo-300 dark:hover:bg-slate-800">{label}</a>)}</div>}
              </div>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-4 md:grid-cols-4" aria-label="Profile statistics">
            <StatCard label="Total Posts" value={activePosts.length} />
            <StatCard label="Drafts" value={drafts.length} />
            <StatCard label="❤️ Likes" value={totalLikes.toLocaleString()} loading={isStatsLoading} />
            <StatCard label="👁 Views" value={totalViews.toLocaleString()} loading={isStatsLoading} />
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
            <section className="order-2 lg:order-1">
              <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900" role="tablist" aria-label="Profile posts">
                {TAB_OPTIONS.map((tab) => <button key={tab} type="button" role="tab" aria-selected={selectedTab === tab} onClick={() => setTab(tab)} className={`min-h-9 rounded-lg px-3 py-2 text-sm font-medium capitalize transition ${selectedTab === tab ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}>{tab}</button>)}
              </div>
              {selectedTab === "bookmarks" ? (
                isBookmarksLoading ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <Loader text="Loading your bookmarks..." />
                  </div>
                ) : bookmarksError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-500/40 dark:bg-red-500/10">
                    <h2 className="text-xl font-semibold text-red-700 dark:text-red-200">Unable to load your bookmarks</h2>
                    <p className="mt-2 text-sm text-red-600 dark:text-red-300">Please try again.</p>
                    <button type="button" onClick={loadBookmarks} className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-red-700">Try again</button>
                  </div>
                ) : bookmarkedPosts.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="mx-auto h-12 w-12 text-slate-400 dark:text-slate-500">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                    </svg>
                    <h2 className="mt-4 text-xl font-semibold text-slate-900 dark:text-white">No bookmarks yet</h2>
                    <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-300">Save stories you want to read later and they'll appear here.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{bookmarkedPosts.map((post) => <PostCard key={post.$id} {...post} />)}</div>
                )
              ) : (selectedTab === "posts" ? activePosts : drafts).length === 0 ? (
                <EmptyPosts draft={selectedTab === "drafts"} />
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{(selectedTab === "posts" ? activePosts : drafts).map((post) => <PostCard key={post.$id} {...post} />)}</div>
              )}
            </section>
            <aside className="order-1 space-y-6 lg:order-2">
              <ProfileAvatar profile={profile} name={profileName} selectedFile={avatarFile} onFileChange={handleAvatarFile} onRemove={handleAvatarRemove} isSaving={isSaving} />
              <ProfileForm profile={profile} onSubmit={handleSave} isSaving={isSaving} />
            </aside>
          </div>
        </div>
      </Container>
    </div>
  );
}

export default Profile;