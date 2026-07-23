import React, { useEffect, useState } from "react";
import { Container, Loader, PostForm } from "../components";
import appwriteService from "../appwrite/config";
import { useNavigate, useParams } from "react-router-dom";

function EditPost() {
    const [post, setPosts] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const { slug } = useParams();
    const navigate = useNavigate();

    useEffect(() => {
        if (slug) {
            setIsLoading(true);
            appwriteService.getPost(slug).then((post) => {
                if (post) {
                    setPosts(post);
                } else {
                    navigate("/");
                }
            }).finally(() => setIsLoading(false));
        } else {
            navigate("/");
        }
    }, [slug, navigate]);

    if (isLoading) {
        return <Loader variant="full" text="Loading article..." />;
    }

    return post ? (
        <div className="py-8 md:py-12">
            <Container>
                <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-8">
                    <p className="text-sm font-medium uppercase tracking-wide text-indigo-600 dark:text-indigo-300">Edit Post</p>
                    <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white md:text-4xl">
                        Refine and republish your story
                    </h1>
                    <p className="mt-3 max-w-3xl text-base text-slate-600 dark:text-slate-300">
                        Update content, replace media, and keep your post polished with the same publishing workflow.
                    </p>
                </section>
                <PostForm post={post} />
            </Container>
        </div>
    ) : null;
}

export default EditPost;
