import React, { useCallback, useEffect, useState } from "react";
import { ThreeDot } from "react-loading-indicators";
import { useForm } from "react-hook-form";
import { Button, Input, RTE, Select } from "..";
import appwriteService from "../../appwrite/config";
import profileService from "../../appwrite/profile";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";

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

export default function PostForm({ post }) {
    const { register, handleSubmit, watch, setValue, control, getValues } = useForm({
        defaultValues: {
            title: post?.title || "",
            slug: post?.$id || "",
            content: post?.content || "",
            status: post?.status || "active",
            category: post?.category || "General",
            tags: Array.isArray(post?.tags) ? post.tags.join(", ") : (post?.tags || ""),
        },
    });

    const navigate = useNavigate();
    const userData = useSelector((state) => state.auth.userData);
    const [profile, setProfile] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUploadingImage, setIsUploadingImage] = useState(false);

    useEffect(() => {
        if (userData?.$id) {
            profileService.getProfile(userData.$id)
                .then((prof) => {
                    if (prof) setProfile(prof);
                })
                .catch(() => {});
        }
    }, [userData]);

    const submit = async (data) => {
        setIsSubmitting(true);
        const tagsStr = data.tags || "";
        const tagsArray = tagsStr.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);

        const userProfile = profile || (userData?.$id ? await profileService.getOrCreateProfile(userData) : null);
        const authorUsername = userProfile?.username || "writer";

        const postDetails = {
            title: data.title,
              slug: data.slug,  
            content: data.content,
            status: data.status,
            category: data.category,
            tags: tagsArray,
            authorUsername,
        };

        try {
            if (post) {
                let fileId = undefined;
                if (data.image?.[0]) {
                    setIsUploadingImage(true);
                    const file = await appwriteService.uploadFile(data.image[0]);
                    setIsUploadingImage(false);
                    if (file) {
                        fileId = file.$id;
                        appwriteService.deleteFile(post.featuredImage);
                    }
                }

                const dbPost = await appwriteService.updatePost(post.$id, {
                    ...postDetails,
                    featuredImage: fileId,
                });

                if (dbPost) {
                    navigate(`/post/${dbPost.$id}`);
                }
            } else {
                setIsUploadingImage(true);
                const file = await appwriteService.uploadFile(data.image[0]);
                setIsUploadingImage(false);

                if (file) {
                    const fileId = file.$id;
                    postDetails.featuredImage = fileId;
                    const dbPost = await appwriteService.createPost({ ...postDetails, userId: userData.$id });

                    if (dbPost) {
                        navigate(`/post/${dbPost.$id}`);
                    }
                }
            }
        } catch (error) {
            console.log("PostForm :: submit :: error", error);
        } finally {
            setIsSubmitting(false);
            setIsUploadingImage(false);
        }
    };

    const slugTransform = useCallback((value) => {
        if (value && typeof value === "string")
            return value
                .trim()
                .toLowerCase()
                .replace(/[^a-zA-Z\d\s]+/g, "-")
                .replace(/\s/g, "-");

        return "";
    }, []);

    React.useEffect(() => {
        const subscription = watch((value, { name }) => {
            if (name === "title") {
                setValue("slug", slugTransform(value.title), { shouldValidate: true });
            }
        });

        return () => subscription.unsubscribe();
    }, [watch, slugTransform, setValue]);

    const isEditMode = Boolean(post);

    return (
        <form onSubmit={handleSubmit(submit)} className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-6">
                <div className="mb-5">
                    <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Editor</h2>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                        Write your content and keep your story clear and engaging.
                    </p>
                </div>
                <div className="space-y-4">
                    <Input
                        label="Title :"
                        placeholder="Title"
                        {...register("title", { required: true })}
                    />
                    <Input
                        label="Slug :"
                        placeholder="Slug"
                        {...register("slug", { required: true })}
                        onInput={(e) => {
                            setValue("slug", slugTransform(e.currentTarget.value), { shouldValidate: true });
                        }}
                    />
                    <div className="rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                        <RTE label="Content :" name="content" control={control} defaultValue={getValues("content")} />
                    </div>
                </div>
            </div>

            <aside className="lg:sticky lg:top-24 lg:self-start">
                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-6">
                    <div>
                        <h3 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">Publishing</h3>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                            Add visual context and manage your publish status.
                        </p>
                    </div>

                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
                        <Input
                            label="Featured Image :"
                            type="file"
                            className="cursor-pointer file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-indigo-700"
                            accept="image/png, image/jpg, image/jpeg, image/gif"
                            {...register("image", { required: !post })}
                        />
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Drag & drop visual area (upload logic unchanged).</p>
                    </div>

                    {(isEditMode || watch("image")?.[0]) && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Preview</p>
                            {isUploadingImage ? (
                                <div className="flex flex-col items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-6 text-center dark:border-slate-600 dark:bg-slate-900">
                                    <ThreeDot color="#6366F1" size="small" />
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Uploading image...</p>
                                </div>
                            ) : post ? (
                                <img
                                    src={appwriteService.getFilePreview(post.featuredImage)}
                                    alt={post.title}
                                    className="w-full rounded-lg object-cover"
                                />
                            ) :watch("image")?.[0] ? (
    <img
        src={URL.createObjectURL(watch("image")[0])}
        alt="Preview"
        className="w-full h-64 object-cover rounded-lg"
    />
) : null}
                        </div>
                    )}

                    <Select
                        options={CATEGORIES}
                        label="Category"
                        className="font-medium"
                        {...register("category", { required: true })}
                    />

                    <Input
                        label="Tags (comma separated) :"
                        placeholder="react, hooks, tailwind"
                        {...register("tags")}
                    />

                    <Select
                        options={["active", "inactive"]}
                        label="Status"
                        className="font-medium"
                        {...register("status", { required: true })}
                    />

                    <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-200">
                        {isEditMode ? "Update your existing post and republish changes." : "Ready to publish? Review details and submit your story."}
                    </div>

                    <Button type="submit" bgColor={post ? "bg-emerald-600" : "bg-indigo-600"} className="w-full justify-center" loading={isSubmitting}>
                        {post ? "Update" : "Submit"}
                    </Button>
                </div>
            </aside>
        </form>
    );
}