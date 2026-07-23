import React from "react";
import { Container, PostForm } from "../components";

function AddPost() {
  return (
    <div className="py-8 md:py-12">
      <Container>
        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-8">
          <p className="text-sm font-medium uppercase tracking-wide text-indigo-600 dark:text-indigo-300">Create Post</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white md:text-4xl">Write and publish your next story</h1>
          <p className="mt-3 max-w-3xl text-base text-slate-600 dark:text-slate-300">
            Craft your article with a focused editor, add a featured image, and publish with polished metadata.
          </p>
        </section>
        <PostForm />
      </Container>
    </div>
  );
}

export default AddPost;
