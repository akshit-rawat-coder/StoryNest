import React, { useEffect, useMemo, useState } from "react";
import { Container, LogoutBtn } from "../index";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import useTheme from "../../context/useTheme";
import profileService from "../../appwrite/profile";
import appwriteService from "../../appwrite/config";

function Header() {
  const authStatus = useSelector((state) => state.auth.status);
  const userData = useSelector((state) => state.auth.userData);
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [allPosts, setAllPosts] = useState([]);
  const [searchFocused, setSearchFocused] = useState(false);

  const handleSearchFocus = async () => {
    setSearchFocused(true);
    if (allPosts.length === 0) {
      try {
        const response = await appwriteService.getPosts();
        if (response && response.rows) {
          const activePosts = response.rows.filter(p => p.status === "active");
          setAllPosts(activePosts);
        }
      } catch (error) {
        console.error("Failed to load posts for search", error);
      }
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const query = debouncedQuery.toLowerCase().trim();
    const matched = allPosts.filter(post => {
      const titleMatch = post.title?.toLowerCase().includes(query);
      const contentMatch = post.content?.toLowerCase().includes(query);
      const authorMatch = post.authorUsername?.toLowerCase().includes(query);
      return titleMatch || contentMatch || authorMatch;
    });
    setSearchResults(matched.slice(0, 8));
  }, [debouncedQuery, allPosts]);

  const primaryNavItems = useMemo(() => {
    const loggedOutItems = [
      { name: "Home", slug: "/" },
      { name: "Login", slug: "/login" },
      { name: "Signup", slug: "/signup" },
    ];

    const loggedInItems = [
      { name: "Home", slug: "/" },
      { name: "All Posts", slug: "/all-posts" },
      { name: "Add Post", slug: "/add-post" },
    ];

    return authStatus ? loggedInItems : loggedOutItems;
  }, [authStatus]);

  const avatarLetter = (userData?.name || userData?.email || "U")
    .trim()
    .charAt(0)
    .toUpperCase();

  const avatarUrl = profileService.getAvatarUrl(profile?.avatar);

  useEffect(() => {
    let mounted = true;
    if (!authStatus || !userData?.$id) {
      setProfile(null);
      return undefined;
    }

    profileService.getProfile(userData.$id)
      .then((nextProfile) => {
        if (mounted) setProfile(nextProfile);
      })
      .catch(() => {
        if (mounted) setProfile(null);
      });

    const syncProfile = (event) => {
      if (mounted) setProfile(event.detail || null);
    };
    window.addEventListener("storynest:profile-updated", syncProfile);
    return () => {
      mounted = false;
      window.removeEventListener("storynest:profile-updated", syncProfile);
    };
  }, [authStatus, userData?.$id]);

  useEffect(() => {
    setMobileMenuOpen(false);
    setProfileOpen(false);
    setSearchQuery("");
  }, [location.pathname]);

  const navLinkClassName = ({ isActive }) =>
    `inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
      isActive
        ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200"
        : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white"
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <Container>
        <nav className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="StoryNest Home"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white shadow-sm">
                S
              </span>
              <span className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                StoryNest
              </span>
            </Link>

            {/* Desktop Search Bar */}
            {authStatus && (
              <div className="relative ml-4 hidden max-w-xs sm:block md:max-w-sm md:w-80">
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={handleSearchFocus}
                    onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                    placeholder="Search articles, tags, authors..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-4 text-xs text-slate-900 transition-colors focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:bg-slate-950 dark:focus:ring-indigo-400/25"
                  />
                </div>

                {/* Floating Dropdown Results */}
                {searchFocused && searchQuery && (
                  <div className="absolute left-0 right-0 mt-2 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-800 dark:bg-slate-900 z-50">
                    {searchResults.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {searchResults.map((post) => (
                          <Link
                            key={post.$id}
                            to={`/post/${post.$id}`}
                            onClick={() => {
                              setSearchQuery("");
                              setSearchFocused(false);
                            }}
                            className="flex flex-col rounded-lg px-3 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition"
                          >
                            <span className="text-xs font-semibold text-slate-900 dark:text-white line-clamp-1">{post.title}</span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                              <span>{post.category || "General"}</span>
                              <span>•</span>
                              <span>@{post.authorUsername || "writer"}</span>
                            </span>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="px-3 py-3 text-center text-[11px] text-slate-500 dark:text-slate-400">No results found for "{searchQuery}"</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="hidden items-center gap-2 md:flex">
            {primaryNavItems.map((item) => (
              <NavLink key={item.slug} to={item.slug} className={navLinkClassName} end={item.slug === "/"}>
                {item.name}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white"
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25M12 18.75V21M4.5 12H2.25M21.75 12H19.5M5.636 5.636l1.59 1.59M16.774 16.774l1.59 1.59M5.636 18.364l1.59-1.59M16.774 7.226l1.59-1.59M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3c0 .3-.02.6-.05.89a7 7 0 009.84 8.9z" />
                </svg>
              )}
            </button>

            {authStatus ? (
              <div className="relative ml-2">
                <button
                  type="button"
                  onClick={() => setProfileOpen((prev) => !prev)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-sm transition hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  aria-haspopup="menu"
                  aria-expanded={profileOpen}
                  aria-label="Open profile menu"
                >
                  {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : avatarLetter}
                </button>

                {profileOpen && (
                  <div className="absolute right-0 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                    <p className="px-2 pb-2 text-xs text-slate-500 dark:text-slate-400">Signed in</p>
                    <div className="flex flex-col gap-1">
                      <NavLink to="/profile" className={navLinkClassName}>
                        My Profile
                      </NavLink>
                      <NavLink to="/profile?tab=posts" className={navLinkClassName}>
                        My Posts
                      </NavLink>
                      <LogoutBtn className="w-full justify-start rounded-lg px-3 py-2" />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="ml-2 flex items-center gap-2">
                <NavLink
                  to="/login"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                  Login
                </NavLink>
                <NavLink
                  to="/signup"
                  className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                >
                  Signup
                </NavLink>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="inline-flex items-center justify-center rounded-lg p-2 text-slate-700 transition hover:bg-slate-100 md:hidden dark:text-slate-200 dark:hover:bg-slate-800"
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle menu"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </nav>

        {mobileMenuOpen && (
          <div className="border-t border-slate-200 py-3 md:hidden dark:border-slate-800">
            <div className="flex flex-col gap-1">
              {/* Mobile Search Bar */}
              {authStatus && (
                <div className="relative mb-3 px-3">
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={handleSearchFocus}
                      onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                      placeholder="Search articles, tags, authors..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm text-slate-900 transition-colors focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:bg-slate-950 dark:focus:ring-indigo-400/25"
                    />
                  </div>

                  {/* Floating Results for Mobile Search */}
                  {searchFocused && searchQuery && (
                    <div className="absolute left-3 right-3 mt-2 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-800 dark:bg-slate-900 z-50">
                      {searchResults.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {searchResults.map((post) => (
                            <Link
                              key={post.$id}
                              to={`/post/${post.$id}`}
                              onClick={() => {
                                setSearchQuery("");
                                setSearchFocused(false);
                                setMobileMenuOpen(false);
                              }}
                              className="flex flex-col rounded-lg px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition"
                            >
                              <span className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-1">{post.title}</span>
                              <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                                <span>{post.category || "General"}</span>
                                <span>•</span>
                                <span>@{post.authorUsername || "writer"}</span>
                              </span>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <p className="px-3 py-4 text-center text-xs text-slate-500 dark:text-slate-400">No results found for "{searchQuery}"</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {primaryNavItems.map((item) => (
                <NavLink key={item.slug} to={item.slug} className={navLinkClassName} end={item.slug === "/"}>
                  {item.name}
                </NavLink>
              ))}

              {authStatus ? (
                <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-800">
                  <div className="mb-2 inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-indigo-600 text-sm font-semibold text-white">
                    {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : avatarLetter}
                  </div>
                  <NavLink to="/profile" className={navLinkClassName}>My Profile</NavLink>
                  <NavLink to="/profile?tab=posts" className={navLinkClassName}>My Posts</NavLink>
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="mb-2 inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                  >
                    {isDark ? "Light mode" : "Dark mode"}
                  </button>
                  <LogoutBtn className="w-full justify-start rounded-lg px-3 py-2" onAfterLogout={() => setMobileMenuOpen(false)} />
                </div>
              ) : (
                <div className="mt-2 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="mb-2 inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                  >
                    {isDark ? "Light mode" : "Dark mode"}
                  </button>
                  <NavLink
                    to="/login"
                    className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-200 dark:hover:bg-slate-800"
                  >
                    Login
                  </NavLink>
                  <NavLink
                    to="/signup"
                    className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                  >
                    Signup
                  </NavLink>
                </div>
              )}
            </div>
          </div>
        )}
      </Container>
    </header>
  );
}

export default Header;
