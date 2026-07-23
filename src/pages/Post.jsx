import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import appwriteService from "../appwrite/config";
import { Button, Container, Loader, PostCard } from "../components";
import parse from "html-react-parser";
import { useSelector } from "react-redux";
import PostSocialActions from "../components/social/PostSocialActions";
import Comments from "../components/social/Comments";

export default function Post() {
    const [post, setPost] = useState(null);
    const [relatedPosts, setRelatedPosts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
    const { slug } = useParams();
    const navigate = useNavigate();
    const userData = useSelector((state) => state.auth.userData);
    const isAuthor = post && userData ? post.userId === userData.$id : false;

    useEffect(() => {
        if (slug) {
            setIsLoading(true);
            appwriteService.getPost(slug).then((nextPost) => {
                if (nextPost) setPost(nextPost);
                else navigate("/");
            }).finally(() => setIsLoading(false));
        } else {
            navigate("/");
        }
    }, [slug, navigate]);

    useEffect(() => {
        if (post) {
            appwriteService.getPosts().then((response) => {
                if (response && response.rows) {
                    const allActive = response.rows.filter(p => p.status === "active" && p.$id !== post.$id);
                    
                    const currentTags = post.tags
                        ? (typeof post.tags === "string" ? post.tags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean) : (Array.isArray(post.tags) ? post.tags.map(t => t.toLowerCase()) : []))
                        : [];

                    const scored = allActive.map(p => {
                        let score = 0;
                        if (p.category && post.category && p.category === post.category) {
                            score += 100;
                        }
                        if (p.tags) {
                            const pTags = typeof p.tags === "string"
                                ? p.tags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean)
                                : (Array.isArray(p.tags) ? p.tags.map(t => t.toLowerCase()) : []);
                            const commonTags = pTags.filter(t => currentTags.includes(t));
                            score += commonTags.length * 10;
                        }
                        return { post: p, score };
                    });

                    const matched = scored
                        .filter(item => item.score > 0)
                        .sort((a, b) => b.score - a.score)
                        .map(item => item.post)
                        .slice(0, 4);

                    setRelatedPosts(matched);
                }
            });
        }
    }, [post]);

    const deletePost = async () => {
        setIsDeleting(true);
        try {
            const status = await appwriteService.deletePost(post.$id);
            if (status) {
                appwriteService.deleteFile(post.featuredImage);
                navigate("/");
            }
        } catch (error) {
            console.log("Post :: deletePost :: error", error);
        } finally {
            setIsDeleting(false);
        }
    };

    const publishedAt = post?.$createdAt
        ? new Date(post.$createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
        : "Recently published";
    const authorLabel = post?.authorUsername || "StoryNest Author";
    const readingTime = post?.content
        ? Math.max(1, Math.ceil(post.content.replace(/<[^>]*>/g, " ").trim().split(/\s+/).filter(Boolean).length / 200))
        : 1;

    const tagsList = post?.tags
        ? (typeof post.tags === "string" ? post.tags.split(",").map(t => t.trim()).filter(Boolean) : (Array.isArray(post.tags) ? post.tags : []))
        : [];

    if (isLoading) {
        return <Loader variant="full" text="Loading article..." />;
    }

    return post ? (
        <div className="py-8 md:py-12">
            <Container>
                <section className="relative mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="aspect-[21/9] w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                        <img src={appwriteService.getFilePreview(post.featuredImage)} alt={post.title} className="h-full w-full object-cover" />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/50 to-transparent" />
                    {isAuthor && <div className="absolute right-4 top-4 flex gap-2 md:right-6 md:top-6">
                        <Link to={`/edit-post/${post.$id}`}><Button bgColor="bg-emerald-600" className="px-3 py-2 text-sm hover:bg-emerald-700">Edit</Button></Link>
                        <Button bgColor="bg-red-600" className="px-3 py-2 text-sm hover:bg-red-700" onClick={deletePost} loading={isDeleting}>Delete</Button>
                    </div>}
                </section>

                <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-8">
                    <div className="mb-6 flex flex-wrap items-center gap-2">
                        {post.category && (
                            <Link to={`/all-posts?category=${encodeURIComponent(post.category)}`} className="inline-flex items-center rounded-full bg-indigo-600 px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 transition dark:bg-indigo-500 dark:hover:bg-indigo-600">{post.category}</Link>
                        )}
                        <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">{readingTime} min read</span>
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">{publishedAt}</span>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white md:text-4xl">{post.title}</h1>
                    
                    {tagsList.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {tagsList.map((tag) => (
                                <Link
                                    key={tag}
                                    to={`/all-posts?tag=${encodeURIComponent(tag)}`}
                                    className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-200 transition dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                                >
                                    #{tag}
                                </Link>
                            ))}
                        </div>
                    )}

                    <Link
                        to={`/profile/${post.authorUsername}`}
                        className="mt-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 transition hover:cursor-pointer hover:bg-slate-100 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800/70 dark:hover:bg-slate-800"
                    >
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">{authorLabel.charAt(0).toUpperCase()}</span>
                        <div><p className="text-sm font-semibold text-slate-900 dark:text-white">{authorLabel}</p><p className="text-xs text-slate-500 dark:text-slate-400">Published on {publishedAt}</p></div>
                    </Link>
                </section>

                <div className="grid grid-cols-1 gap-8 lg:grid-cols-[120px_minmax(0,1fr)]">
                    <aside><div className="sticky top-24 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"><PostSocialActions postId={post.$id} user={userData} /></div></aside>
                    <section className="min-w-0">
                        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-8">
                            <div className="mx-auto max-w-[70ch] text-base leading-8 text-slate-700 dark:text-slate-300"><div className="browser-css [&_h1]:mb-4 [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_p]:mb-5 [&_ul]:mb-5 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-5 [&_ol]:list-decimal [&_ol]:pl-6 [&_a]:text-indigo-600 [&_a]:underline dark:[&_a]:text-indigo-300">{parse(post.content)}</div></div>
                        </article>
                        {relatedPosts.length > 0 && (
                            <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-8">
                                <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Related posts</h2>
                                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    {relatedPosts.map((rPost) => (
                                        <div key={rPost.$id} className="w-full">
                                            <PostCard {...rPost} />
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}
                        <Comments postId={post.$id} user={userData} />
                    </section>
                </div>
            </Container>
        </div>
    ) : null;
}
