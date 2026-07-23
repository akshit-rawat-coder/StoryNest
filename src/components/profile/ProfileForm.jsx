import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import Button from "../Button";
import Input from "../Input";

const isUrl = (value) => {
  if (!value) return true;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

const isDomainUrl = (domain) => (value) => {
  if (!value) return true;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === domain || hostname.endsWith(`.${domain}`);
  } catch {
    return false;
  }
};

function FieldError({ error }) {
  return error ? <p className="mt-1 text-sm text-red-600 dark:text-red-300">{error.message}</p> : null;
}

function ProfileForm({ profile, onSubmit, isSaving }) {
  const { register, handleSubmit, formState: { errors }, reset } = useForm({
    defaultValues: { username: "", bio: "", website: "", github: "", linkedin: "" },
  });

  useEffect(() => {
    if (profile) {
      reset({
        username: profile.username || "",
        bio: profile.bio || "",
        website: profile.website || "",
        github: profile.github || "",
        linkedin: profile.linkedin || "",
      });
    }
  }, [profile, reset]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Public profile</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Keep your details accurate and recognizable.</p>
      </div>
      <div className="space-y-4">
        <div>
          <Input label="Username" placeholder="your-username" autoComplete="username" {...register("username", { required: "Username is required.", maxLength: { value: 50, message: "Username must be 50 characters or fewer." }, pattern: { value: /^[a-zA-Z0-9_.-]+$/, message: "Use letters, numbers, dots, hyphens, or underscores only." } })} />
          <FieldError error={errors.username} />
        </div>
        <div>
          <label htmlFor="profile-bio" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Bio</label>
          <textarea id="profile-bio" rows="4" placeholder="Tell readers a little about yourself." className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-400" {...register("bio", { maxLength: { value: 250, message: "Bio must be 250 characters or fewer." } })} />
          <FieldError error={errors.bio} />
        </div>
        <div>
          <Input label="Website" type="url" placeholder="https://example.com" {...register("website", { validate: (value) => isUrl(value) || "Enter a valid URL including http:// or https://." })} />
          <FieldError error={errors.website} />
        </div>
        <div>
          <Input label="GitHub" type="url" placeholder="https://github.com/username" {...register("github", { validate: (value) => isDomainUrl("github.com")(value) || "Enter a valid github.com URL." })} />
          <FieldError error={errors.github} />
        </div>
        <div>
          <Input label="LinkedIn" type="url" placeholder="https://linkedin.com/in/username" {...register("linkedin", { validate: (value) => isDomainUrl("linkedin.com")(value) || "Enter a valid linkedin.com URL." })} />
          <FieldError error={errors.linkedin} />
        </div>
      </div>
      <div className="mt-6 flex justify-end">
        <Button type="submit" loading={isSaving}>Save profile</Button>
      </div>
    </form>
  );
}

export default ProfileForm;
