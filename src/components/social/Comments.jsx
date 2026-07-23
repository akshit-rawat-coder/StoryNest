import React, { useCallback, useEffect, useState } from "react";
import { ThreeDot } from "react-loading-indicators";
import { useForm } from "react-hook-form";
import socialService from "../../appwrite/social";
import Button from "../Button";

function Comments({ postId, user }) {
  const [comments, setComments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ defaultValues: { content: "" } });

  const loadComments = useCallback(async () => {
    setIsLoading(true);
    try {
      setComments(await socialService.getComments(postId));
      setError("");
    } catch {
      setError("Comments are unavailable right now. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [postId]);

  useEffect(() => { loadComments(); }, [loadComments]);

  const submit = async ({ content }) => {
    if (!user?.$id) {
      setError("Sign in to leave a comment.");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      if (editingId) {
        const updated = await socialService.updateComment(editingId, content.trim());
        setComments((items) => items.map((comment) => comment.$id === editingId ? updated : comment));
        setEditingId(null);
      } else {
        const created = await socialService.createComment({ postId, userId: user.$id, authorName: user.name || user.email || "StoryNest reader", content: content.trim() });
        setComments((items) => [created, ...items]);
      }
      reset();
    } catch {
      setError("We could not save your comment. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = (comment) => {
    setEditingId(comment.$id);
    reset({ content: comment.content });
    setError("");
  };

  const remove = async (commentId) => {
    setError("");
    setDeletingId(commentId);
    try {
      await socialService.deleteComment(commentId);
      setComments((items) => items.filter((comment) => comment.$id !== commentId));
      if (editingId === commentId) {
        setEditingId(null);
        reset();
      }
    } catch {
      setError("We could not delete that comment. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-8">
      <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Comments</h2>
      <form onSubmit={handleSubmit(submit)} className="mt-5" noValidate>
        <label htmlFor="comment-content" className="sr-only">Your comment</label>
        <textarea id="comment-content" rows="4" placeholder={user ? "Join the conversation…" : "Sign in to leave a comment."} disabled={!user || isSaving} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800" {...register("content", { required: "Write a comment before posting.", maxLength: { value: 1000, message: "Comments must be 1,000 characters or fewer." }, validate: (value) => value.trim().length > 0 || "Write a comment before posting." })} />
        {errors.content && <p className="mt-1 text-sm text-red-600 dark:text-red-300">{errors.content.message}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="submit" disabled={!user} loading={isSaving}>{editingId ? "Save changes" : "Post comment"}</Button>
          {editingId && <Button type="button" bgColor="bg-slate-100 dark:bg-slate-800" textColor="text-slate-700 dark:text-slate-100" onClick={() => { setEditingId(null); reset(); }}>Cancel</Button>}
        </div>
      </form>
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">{error}</p>}
      <div className="mt-6 space-y-4">
        {isLoading ? [1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />) : comments.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">No comments yet. Start the conversation.</p> : comments.map((comment) => <article key={comment.$id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold text-slate-900 dark:text-white">{comment.authorName || "StoryNest reader"}</p><p className="text-xs text-slate-500 dark:text-slate-400">{comment.$createdAt ? new Date(comment.$createdAt).toLocaleDateString() : "Just now"}</p></div>{user?.$id === comment.userId && <div className="flex gap-2"><button type="button" onClick={() => startEdit(comment)} className="text-xs font-medium text-indigo-700 hover:underline dark:text-indigo-300">Edit</button>{deletingId === comment.$id ? <ThreeDot color="#6366F1" size="small" /> : <button type="button" onClick={() => remove(comment.$id)} className="text-xs font-medium text-red-600 hover:underline dark:text-red-300">Delete</button>}</div>}</div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-300">{comment.content}</p></article>)}
      </div>
    </section>
  );
}

export default Comments;
