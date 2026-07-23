import React from 'react'

function Logo({width = '100px'}) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-lg"
      style={{ width }}
      aria-label="StoryNest logo"
    >
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white shadow-sm">
        S
      </span>
      <span className="text-base font-semibold tracking-tight text-slate-900 dark:text-white">
        StoryNest
      </span>
    </div>
  )
}

export default Logo
