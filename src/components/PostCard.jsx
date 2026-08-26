import React, { useEffect, useState } from 'react'
import appwriteService from "../appwrite/config"
import socialService from "../appwrite/social"
import { useSelector } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import { PhotoProvider, PhotoView } from "react-photo-view";
import { calculateReadingTime } from "../utils/readingTime";

function PostCard({ $id, title, featuredImage, status, category, tags, content }) {
  const navigate = useNavigate();
  const userData = useSelector((state) => state.auth.userData);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);

  useEffect(() => {
    if (!userData?.$id) return;
    let cancelled = false;
    socialService.getUserBookmark($id, userData.$id).then((bm) => {
      if (!cancelled) setBookmarked(Boolean(bm));
    }).catch(() => { });
    return () => { cancelled = true; };
  }, [$id, userData?.$id]);

  const handleBookmark = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!userData?.$id || bookmarkLoading) return;
    setBookmarkLoading(true);
    try {
      const next = await socialService.toggleBookmark($id, userData.$id);
      setBookmarked(next);
      window.dispatchEvent(new CustomEvent("storynest:bookmarks-updated"));
    } catch {
      // Silent fail — button stays in previous state
    } finally {
      setBookmarkLoading(false);
    }
  };

  const handleFilterClick = (e, filterType, filterValue) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/all-posts?${filterType}=${encodeURIComponent(filterValue)}`);
  };

  const badgeText = category || (status === "active" ? "" : status);

  const tagsList = typeof tags === 'string'
    ? tags.split(',').map(t => t.trim()).filter(Boolean)
    : (Array.isArray(tags) ? tags : []);

  const readingTime = calculateReadingTime(content);

  function getPlainText(html) {
    if (!html || typeof html !== "string") return "";
    return html
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const MAX_PREVIEW_LENGTH = 150;
  const plainText = getPlainText(content);
  const isLongContent = plainText.length > MAX_PREVIEW_LENGTH;
  const truncatedText = plainText.slice(0, MAX_PREVIEW_LENGTH);
  const lastSpaceIndex = truncatedText.lastIndexOf(" ");
  const previewText =
    lastSpaceIndex > 0 ? truncatedText.slice(0, lastSpaceIndex) + "..." : truncatedText + "...";

  return (
    <Link to={`/post/${$id}`} className="block h-full">
      <div className='group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900'>
        <div className='relative aspect-video w-full overflow-hidden bg-slate-100 dark:bg-slate-800'>
          {featuredImage ? (
            <PhotoProvider maskOpacity={0.85} bannerVisible={false} loop={false}>
              <PhotoView src={appwriteService.getFilePreview(featuredImage)}>
                <img
                  src={appwriteService.getFilePreview(featuredImage)}
                  alt={title}
                  className='h-full w-full cursor-pointer object-cover transition-transform duration-300 group-hover:scale-105'
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                />
              </PhotoView>
            </PhotoProvider>
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100 dark:from-slate-800 dark:to-slate-900">
              <div className="flex flex-col items-center gap-1 text-slate-400 dark:text-slate-500">
                <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
                <span className="text-[10px] font-medium">No image</span>
              </div>
            </div>
          )}
          {badgeText && (
            <button
              onClick={(e) => handleFilterClick(e, "category", badgeText)}
              className="absolute left-3 top-3 inline-flex items-center rounded-full bg-indigo-600 px-2.5 py-1 text-[10px] font-semibold text-white shadow-sm hover:bg-indigo-700 transition dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              {String(badgeText)}
            </button>
          )}
          {/* Bookmark button */}
          {userData?.$id && (
            <button
              type="button"
              onClick={handleBookmark}
              disabled={bookmarkLoading}
              aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this post'}
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full
                      bg-white/80 backdrop-blur-sm transition-all duration-200
                      hover:bg-white hover:scale-105 disabled:opacity-60
                      dark:bg-slate-900/80 dark:hover:bg-slate-900"
            >
              {bookmarkLoading ? (
                <svg className="h-4 w-4 animate-spin text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : bookmarked ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-indigo-600 dark:text-indigo-400 transition-colors duration-200">
                  <path fillRule="evenodd" d="M6.32 2.577a49.255 49.255 0 0111.36 0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 01-1.085.67L12 18.089l-7.165 3.583A.75.75 0 013.75 21V5.507c0-1.47 1.073-2.756 2.57-2.93z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5 text-slate-600 dark:text-slate-300 transition-colors duration-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                </svg>
              )}
            </button>
          )}
        </div>
        <div className="flex flex-1 flex-col p-4">
          <h2 className='text-lg font-semibold tracking-tight text-slate-900 dark:text-white mb-2 transition-colors group-hover:text-indigo-600 dark:group-hover:text-indigo-400'>
            {title}
          </h2>

          {tagsList.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {tagsList.map((tag) => (
                <button
                  key={tag}
                  onClick={(e) => handleFilterClick(e, "tag", tag)}
                  className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-200 transition dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}

          {plainText && (
            <div className="relative mt-3">
              <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3">
                {isLongContent ? previewText : plainText}
              </p>
              {isLongContent && (
                <>
                  <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white to-transparent dark:from-slate-900 pointer-events-none" />
                  <span className="relative mt-1 inline-block text-xs font-medium text-indigo-600 dark:text-indigo-400">
                    Read more →
                  </span>
                </>
              )}
            </div>
          )}

          <div className="mt-auto flex items-center justify-between border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <span>{readingTime} min read</span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
              StoryNest
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

export default PostCard