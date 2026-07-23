import React, { useEffect, useRef, useState } from "react";
import { ThreeDot } from "react-loading-indicators";
import socialService from "../../appwrite/social";

function ActionButton({ children, active, onClick, disabled, label, loading }) {
  return <button type="button" onClick={onClick} disabled={disabled || loading} aria-label={label} className={`inline-flex min-h-9 items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${active ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-200" : "border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"}`}>
    {loading ? <ThreeDot color="#6366F1" size="small" /> : children}
  </button>;
}

function PostSocialActions({ postId, user }) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [bookmarked, setBookmarked] = useState(false);
  const [viewCount, setViewCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const likeRequestVersion = useRef(0);

  useEffect(() => {
    let mounted = true;
    const requestVersion = ++likeRequestVersion.current;
    const loadActions = async () => {
      try {
        const tasks = [socialService.getViewCount(postId), socialService.getLikeCount(postId)];
        if (user?.$id) tasks.push(socialService.getUserLike(postId, user.$id), socialService.getUserBookmark(postId, user.$id));
        const [nextViewCount, nextLikeCount, like, bookmark] = await Promise.all(tasks);
        if (mounted && requestVersion === likeRequestVersion.current) {
          setViewCount(nextViewCount);
          setLikeCount(nextLikeCount);
          setLiked(Boolean(like));
          setBookmarked(Boolean(bookmark));
        }
      } catch {
        if (mounted) setNotice("Social activity is temporarily unavailable.");
      }
    };
    loadActions();
    return () => { mounted = false; };
  }, [postId, user?.$id]);

  useEffect(() => {
    const storageKey = `storynest:view:${postId}`;
    try {
      if (sessionStorage.getItem(storageKey)) return;
      sessionStorage.setItem(storageKey, "1");
      socialService.recordView(postId, user?.$id || "").then(() => setViewCount((count) => count + 1)).catch(() => {});
    } catch {
      // View tracking is intentionally non-blocking when browser storage is unavailable.
    }
  }, [postId, user?.$id]);

  const toggle = async (type) => {
    if (!user?.$id) {
      setNotice("Sign in to save this interaction.");
      return;
    }
    setNotice("");
    setIsSaving(true);
    try {
      if (type === "like") {
        likeRequestVersion.current += 1;
        const nextLiked = await socialService.toggleLike(postId, user.$id);
        setLiked(nextLiked);
        setLikeCount((count) => Math.max(0, count + (nextLiked ? 1 : -1)));
      } else {
        setBookmarked(await socialService.toggleBookmark(postId, user.$id));
      }
    } catch {
      setNotice("We could not save that change. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const share = async (network) => {
    const url = window.location.href;
    const text = document.title;
    try {
      if (network === "native" && navigator.share) {
        await navigator.share({ title: text, url });
      } else if (network === "copy") {
        await navigator.clipboard.writeText(url);
        setNotice("Link copied to your clipboard.");
      } else {
        const shareUrl = network === "linkedin"
          ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`
          : `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
        window.open(shareUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      setNotice("Sharing was cancelled or unavailable.");
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Engage</p>
      <div className="flex flex-wrap gap-2 lg:flex-col">
        <ActionButton active={liked} onClick={() => toggle("like")} disabled={isSaving} loading={isSaving} label={liked ? "Unlike this post" : "Like this post"}>{liked ? "♥ Liked" : "♡ Like"} ({likeCount})</ActionButton>
        <ActionButton active={bookmarked} onClick={() => toggle("bookmark")} disabled={isSaving} loading={isSaving} label={bookmarked ? "Remove bookmark" : "Bookmark this post"}>{bookmarked ? "★ Saved" : "☆ Save"}</ActionButton>
      </div>
      <p className="pt-1 text-center text-xs text-slate-500 dark:text-slate-400">{viewCount} {viewCount === 1 ? "view" : "views"}</p>
      <div className="border-t border-slate-200 pt-2 dark:border-slate-700">
        <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Share</p>
        <div className="flex flex-wrap gap-2 lg:flex-col">
          {navigator.share && <ActionButton onClick={() => share("native")} label="Share this post">Share</ActionButton>}
          <ActionButton onClick={() => share("x")} label="Share on X">X</ActionButton>
          <ActionButton onClick={() => share("linkedin")} label="Share on LinkedIn">in</ActionButton>
          <ActionButton onClick={() => share("copy")} label="Copy post link">Copy link</ActionButton>
        </div>
      </div>
      {notice && <p role="status" className="text-center text-xs text-slate-500 dark:text-slate-400">{notice}</p>}
    </div>
  );
}

export default PostSocialActions;
