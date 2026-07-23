import React, { useEffect, useState } from "react";
import profileService from "../../appwrite/profile";
import Button from "../Button";

const initialFor = (name) => (name || "U").trim().charAt(0).toUpperCase();

function ProfileAvatar({ profile, name, selectedFile, onFileChange, onRemove, isSaving }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const storedAvatarUrl = profileService.getAvatarUrl(profile?.avatar);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return undefined;
    }
    const nextPreviewUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(nextPreviewUrl);
    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [selectedFile]);

  const avatarUrl = previewUrl || storedAvatarUrl;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Profile photo</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Use a clear square image up to 5 MB.</p>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-indigo-600 text-3xl font-semibold text-white shadow-sm">
          {avatarUrl ? <img src={avatarUrl} alt="Profile preview" className="h-full w-full object-cover" /> : initialFor(name)}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700">
            {selectedFile || profile?.avatar ? "Change photo" : "Upload photo"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              onChange={(event) => onFileChange(event.target.files?.[0] || null)}
              disabled={isSaving}
            />
          </label>
          {(selectedFile || profile?.avatar) && (
            <Button type="button" bgColor="bg-white dark:bg-slate-900" textColor="text-red-600 dark:text-red-300" className="border border-red-200 hover:bg-red-50 dark:border-red-500/40 dark:hover:bg-red-500/10" onClick={onRemove} disabled={isSaving}>
              Remove
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

export default ProfileAvatar;
