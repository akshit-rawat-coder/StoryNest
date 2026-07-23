import React from "react";
import { Link } from "react-router-dom";

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-4 lg:col-span-1">
            <Link to="/" className="inline-flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white shadow-sm">
                S
              </span>
              <span className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                StoryNest
              </span>
            </Link>
            <p className="max-w-xs text-sm leading-6 text-slate-600 dark:text-slate-300">
              A modern publishing space to write, manage, and share stories with clean workflows and polished reading
              experiences.
            </p>
            <div className="flex items-center gap-2">
              <a
                href="#"
                aria-label="StoryNest on X"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18.244 2H21l-6.56 7.502L22 22h-5.956l-4.664-6.106L6.01 22H3.25l7.014-8.018L2 2h6.108l4.216 5.567L18.244 2z" />
                </svg>
              </a>
              <a
                href="#"
                aria-label="StoryNest on LinkedIn"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M4.98 3.5C4.98 4.88 3.86 6 2.48 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.5 8h4V23h-4V8zm7 0h3.84v2.05h.06c.54-1.02 1.86-2.1 3.84-2.1 4.11 0 4.86 2.71 4.86 6.23V23h-4v-7.74c0-1.85-.04-4.22-2.57-4.22-2.58 0-2.98 2.02-2.98 4.09V23h-4V8z" />
                </svg>
              </a>
              <a
                href="#"
                aria-label="StoryNest on GitHub"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 .5A12 12 0 0 0 8.2 23.9c.6.1.8-.2.8-.6v-2.2c-3.4.8-4.1-1.4-4.1-1.4-.6-1.3-1.3-1.6-1.3-1.6-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 .2 2.1.8 2.7 2 .8 1.3 2.3.9 2.8.7.1-.6.4-1 .8-1.2-2.7-.3-5.6-1.3-5.6-6A4.8 4.8 0 0 1 7 10.5a4.5 4.5 0 0 1 .1-3.4s1-.3 3.4 1.3a11.7 11.7 0 0 1 6.2 0c2.4-1.6 3.4-1.3 3.4-1.3.5 1.1.5 2.3.1 3.4a4.8 4.8 0 0 1 1.3 3.3c0 4.7-2.9 5.7-5.7 6 .4.3.9 1 .9 2v3c0 .4.2.7.8.6A12 12 0 0 0 12 .5z" />
                </svg>
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Quick Links</h3>
            <ul className="mt-4 space-y-3">
              <li>
                <Link to="/" className="text-sm text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
                  Home
                </Link>
              </li>
              <li>
                <Link
                  to="/all-posts"
                  className="text-sm text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                >
                  All Posts
                </Link>
              </li>
              <li>
                <Link
                  to="/add-post"
                  className="text-sm text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                >
                  Add Post
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Account</h3>
            <ul className="mt-4 space-y-3">
              <li>
                <Link
                  to="/login"
                  className="text-sm text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                >
                  Login
                </Link>
              </li>
              <li>
                <Link
                  to="/signup"
                  className="text-sm text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                >
                  Signup
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Resources</h3>
            <ul className="mt-4 space-y-3">
              <li>
                <a href="#" className="text-sm text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
                  Community Guidelines
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
                  Terms & Conditions
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
                  Privacy Policy
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-slate-200 pt-6 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            &copy; {new Date().getFullYear()} StoryNest. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
