import React from 'react'
import appwriteService from "../appwrite/config"
import { Link, useNavigate } from 'react-router-dom'
import { PhotoProvider, PhotoView } from "react-photo-view";

function PostCard({ $id, title, featuredImage, status, category, tags, content }) {
  const navigate = useNavigate();

  const handleFilterClick = (e, filterType, filterValue) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/all-posts?${filterType}=${encodeURIComponent(filterValue)}`);
  };

  const badgeText = category || (status === "active" ? "" : status);

  const tagsList = typeof tags === 'string'
    ? tags.split(',').map(t => t.trim()).filter(Boolean)
    : (Array.isArray(tags) ? tags : []);

  const readingTime = content
    ? Math.max(1, Math.ceil(content.replace(/<[^>]*>/g, " ").trim().split(/\s+/).filter(Boolean).length / 200))
    : 1;

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
