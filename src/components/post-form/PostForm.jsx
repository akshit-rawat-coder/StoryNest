import React, { useCallback, useEffect, useState } from "react";
import { ThreeDot } from "react-loading-indicators";
import { useForm } from "react-hook-form";
import { Button, Input, RTE, Select } from "..";
import appwriteService from "../../appwrite/config";
import profileService from "../../appwrite/profile";
import aiService from "../../appwrite/ai";
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
    const [isImproving, setIsImproving] = useState(false);
    const [isSummarizing, setIsSummarizing] = useState(false);
    const [isGeneratingTitles, setIsGeneratingTitles] = useState(false);
    const [summary, setSummary] = useState("");
    const [titles, setTitles] = useState([]);
    const [aiError, setAiError] = useState("");

    useEffect(() => {
        if (userData?.$id) {
            profileService.getProfile(userData.$id)
                .then((prof) => {
                    if (prof) setProfile(prof);
                })
                .catch(() => { });
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
                        // Delete old image only if it exists
                        if (post.featuredImage) {
                            appwriteService.deleteFile(post.featuredImage);
                        }
                    }
                }

                const updateData = { ...postDetails };
                // Only set featuredImage if a new file was uploaded
                if (fileId !== undefined) {
                    updateData.featuredImage = fileId;
                }
                // If no new file selected, keep the existing featuredImage (don't send undefined)

                const dbPost = await appwriteService.updatePost(post.$id, updateData);

                if (dbPost) {
                    navigate(`/post/${dbPost.$id}`);
                }
            } else {
                // Create new post
                if (data.image?.[0]) {
                    setIsUploadingImage(true);
                    const file = await appwriteService.uploadFile(data.image[0]);
                    setIsUploadingImage(false);
                    if (file) {
                        postDetails.featuredImage = file.$id;
                    } else {
                        postDetails.featuredImage = null;
                    }
                } else {
                    postDetails.featuredImage = null;
                }

                const dbPost = await appwriteService.createPost({ ...postDetails, userId: userData.$id });

                if (dbPost) {
                    navigate(`/post/${dbPost.$id}`);
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

    const getEditorTextOnly = () => {
        const rawContent = getValues("content") || "";
        // Strip HTML tags to check for raw text content
        return rawContent.replace(/<[^>]*>/g, '').trim();
    };

    const validateContentNotEmpty = () => {
        const textOnly = getEditorTextOnly();
        if (!textOnly) {
            setAiError("Please write some content first.");
            return false;
        }
        setAiError("");
        return true;
    };

    const getAiErrorMessage = (error, action) => {
        if (error?.code === "INPUT_TOO_LARGE") {
            return error.message;
        }
        // Show quota errors directly - they are actionable for the user
        if (error?.message?.includes("AI quota exceeded")) {
            return error.message;
        }
        const messages = {
            improve: "Unable to improve the writing right now. Please try again.",
            summarize: "Unable to generate a summary right now.",
            title: "Unable to generate titles right now.",
        };
        return messages[action] || "An unexpected error occurred. Please try again.";
    };

    const handleImproveWriting = async () => {
        if (!validateContentNotEmpty()) return;
        setIsImproving(true);
        setAiError("");
        try {
            const rawContent = getValues("content");
            const improvedText = await aiService.improveText(rawContent);
            if (improvedText) {
                setValue("content", improvedText);
            } else {
                throw new Error("Empty response received from AI assistant.");
            }
        } catch (error) {
            setAiError(getAiErrorMessage(error, "improve"));
        } finally {
            setIsImproving(false);
        }
    };

    const handleGenerateSummary = async () => {
        if (!validateContentNotEmpty()) return;
        setIsSummarizing(true);
        setAiError("");
        try {
            const rawContent = getValues("content");
            const resSummary = await aiService.summarizeText(rawContent);
            if (resSummary) {
                setSummary(resSummary);
            } else {
                throw new Error("Empty summary received.");
            }
        } catch (error) {
            setAiError(getAiErrorMessage(error, "summarize"));
        } finally {
            setIsSummarizing(false);
        }
    };

    const handleGenerateTitles = async () => {
        if (!validateContentNotEmpty()) return;
        setIsGeneratingTitles(true);
        setAiError("");
        try {
            const rawContent = getValues("content");
            const resTitles = await aiService.generateTitles(rawContent);
            if (resTitles && resTitles.length > 0) {
                setTitles(resTitles);
            } else {
                throw new Error("No titles received.");
            }
        } catch (error) {
            setAiError(getAiErrorMessage(error, "title"));
        } finally {
            setIsGeneratingTitles(false);
        }
    };

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

                {/* AI Writing Assistant Section */}
                <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-800/60">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mr-2">
                            AI Writer:
                        </span>

                        <button
                            type="button"
                            onClick={handleImproveWriting}
                            disabled={isImproving || isSummarizing || isGeneratingTitles}
                            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors ${isImproving
                                ? "bg-indigo-500 cursor-not-allowed"
                                : "bg-indigo-600 hover:bg-indigo-750 active:bg-indigo-800"
                                } disabled:opacity-50`}
                        >
                            {isImproving ? "Improving..." : "Improve with AI"}
                        </button>

                        <button
                            type="button"
                            onClick={handleGenerateSummary}
                            disabled={isImproving || isSummarizing || isGeneratingTitles}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
                        >
                            {isSummarizing ? "Summarizing..." : "Generate Summary"}
                        </button>

                        <button
                            type="button"
                            onClick={handleGenerateTitles}
                            disabled={isImproving || isSummarizing || isGeneratingTitles}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
                        >
                            {isGeneratingTitles ? "Generating..." : "Generate Titles"}
                        </button>
                    </div>

                    {/* Error Handling */}
                    {aiError && (
                        <div className="mt-4 rounded-xl border border-red-200 bg-red-50/50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-500/20 dark:bg-red-950/20 dark:text-red-300 flex justify-between items-center">
                            <span>{aiError}</span>
                            <button
                                type="button"
                                onClick={() => setAiError("")}
                                className="text-red-500 hover:text-red-700 dark:text-red-450 dark:hover:text-red-300 font-bold ml-2 focus:outline-none"
                            >
                                ✕
                            </button>
                        </div>
                    )}

                    {/* Summary Display */}
                    {summary && (
                        <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/30 p-4 dark:border-indigo-500/10 dark:bg-indigo-950/10">
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold text-indigo-900 dark:text-indigo-300">
                                    AI Summary
                                </h4>
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            navigator.clipboard.writeText(summary);
                                            const originalText = document.getElementById("copy-btn").innerText;
                                            document.getElementById("copy-btn").innerText = "Copied!";
                                            setTimeout(() => {
                                                document.getElementById("copy-btn").innerText = originalText;
                                            }, 2000);
                                        }}
                                        id="copy-btn"
                                        className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium cursor-pointer"
                                    >
                                        Copy
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSummary("")}
                                        className="text-xs text-slate-400 hover:text-slate-600 dark:text-slate-550 dark:hover:text-slate-350 cursor-pointer"
                                    >
                                        Dismiss
                                    </button>
                                </div>
                            </div>
                            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{summary}</p>
                        </div>
                    )}

                    {/* Titles Display */}
                    {titles.length > 0 && (
                        <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/30 p-4 dark:border-indigo-500/10 dark:bg-indigo-950/10">
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="text-sm font-semibold text-indigo-900 dark:text-indigo-300">
                                    AI Titles (Click to apply)
                                </h4>
                                <button
                                    type="button"
                                    onClick={() => setTitles([])}
                                    className="text-xs text-slate-400 hover:text-slate-600 dark:text-slate-550 dark:hover:text-slate-350 cursor-pointer"
                                    id="dismiss-titles-btn"
                                >
                                    Dismiss
                                </button>
                            </div>
                            <div className="space-y-2">
                                {titles.map((titleText, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => {
                                            setValue("title", titleText);
                                            setValue("slug", slugTransform(titleText), { shouldValidate: true });
                                        }}
                                        className="w-full text-left p-3 rounded-lg border border-slate-200 bg-white hover:border-indigo-500 hover:bg-indigo-50/30 text-sm text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-950/30 transition-all font-medium"
                                    >
                                        {titleText}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
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
                            {...register("image")}
                        />
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Drag & drop visual area.</p>
                    </div>

                    {(post?.featuredImage || watch("image")?.[0]) && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Preview</p>
                            {isUploadingImage ? (
                                <div className="flex flex-col items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-6 text-center dark:border-slate-600 dark:bg-slate-900">
                                    <ThreeDot color="#6366F1" size="small" />
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Uploading image...</p>
                                </div>
                            ) : post?.featuredImage ? (
                                <img
                                    src={appwriteService.getFilePreview(post.featuredImage)}
                                    alt={post.title}
                                    className="w-full rounded-lg object-cover"
                                />
                            ) : watch("image")?.[0] ? (
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