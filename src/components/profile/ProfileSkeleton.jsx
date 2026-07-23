import React from "react";

function ProfileSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-label="Loading profile" role="status">
      <div className="h-48 rounded-2xl bg-slate-200 dark:bg-slate-800" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((item) => <div key={item} className="h-24 rounded-2xl bg-slate-200 dark:bg-slate-800" />)}
      </div>
      <div className="h-96 rounded-2xl bg-slate-200 dark:bg-slate-800" />
      <span className="sr-only">Loading profile</span>
    </div>
  );
}

export default ProfileSkeleton;
