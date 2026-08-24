# Graph Report - MegaBlog.1  (2026-08-23)

## Corpus Check
- 66 files · ~61,827 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 236 nodes · 434 edges · 21 communities (15 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- App Core & Routing
- NPM Dependencies
- Dev Tooling & Config
- UI Components & Profiles
- Social Service (Likes/Comments)
- Appwrite Services & PostForm
- Pages & Router
- Auth Service
- Profile Service
- Post/File/DB Service
- Linter Rules
- AI Writing Service
- AI Function Test Script
- Vercel Deploy Config

## God Nodes (most connected - your core abstractions)
1. `react` - 38 edges
2. `SocialService` - 17 edges
3. `ProfileService` - 11 edges
4. `AuthService` - 10 edges
5. `Services` - 10 edges
6. `Button()` - 10 edges
7. `Container()` - 10 edges
8. `Loader()` - 8 edges
9. `PostCard()` - 7 edges
10. `conf` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Header()` --calls--> `useTheme()`  [EXTRACTED]
  src/components/Header/Header.jsx → src/context/useTheme.js
- `Loader()` --calls--> `useTheme()`  [EXTRACTED]
  src/components/Loader.jsx → src/context/useTheme.js
- `AllPosts()` --calls--> `usePollingPosts()`  [EXTRACTED]
  src/pages/AllPosts.jsx → src/hooks/usePollingPosts.js
- `Home()` --calls--> `usePollingPosts()`  [EXTRACTED]
  src/pages/Home.jsx → src/hooks/usePollingPosts.js

## Import Cycles
- None detected.

## Communities (21 total, 6 thin omitted)

### Community 0 - "App Core & Routing"
Cohesion: 0.10
Nodes (21): react, Protected(), Container(), Footer(), Header(), LogoutBtn(), Input(), Loader() (+13 more)

### Community 1 - "NPM Dependencies"
Cohesion: 0.07
Nodes (29): appwrite, claude, code, gsap, html-react-parser, dependencies, appwrite, claude (+21 more)

### Community 2 - "Dev Tooling & Config"
Cohesion: 0.07
Nodes (26): autoprefixer, oxlint, devDependencies, autoprefixer, oxlint, postcss, tailwindcss, @types/react (+18 more)

### Community 3 - "UI Components & Profiles"
Cohesion: 0.13
Nodes (12): Button(), initialFor(), ProfileAvatar(), isDomainUrl(), isUrl(), ProfileForm(), ProfileSkeleton(), Comments() (+4 more)

### Community 5 - "Appwrite Services & PostForm"
Cohesion: 0.23
Nodes (6): CATEGORIES, TextType(), conf, usePollingPosts(), AllPosts(), Home()

### Community 6 - "Pages & Router"
Cohesion: 0.16
Nodes (10): router, AddPost(), EditPost(), Post(), Signup(), STATUS, VerifyEmail(), authSlice (+2 more)

### Community 10 - "Linter Rules"
Cohesion: 0.25
Nodes (7): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema, oxc, warn

### Community 12 - "AI Function Test Script"
Cohesion: 0.50
Nodes (4): client, functions, run(), testAction()

## Knowledge Gaps
- **44 isolated node(s):** `$schema`, `oxc`, `react/rules-of-hooks`, `warn`, `name` (+39 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `App Core & Routing` to `Linter Rules`, `UI Components & Profiles`, `Appwrite Services & PostForm`, `Pages & Router`?**
  _High betweenness centrality (0.127) - this node is a cross-community bridge._
- **Why does `SocialService` connect `Social Service (Likes/Comments)` to `Appwrite Services & PostForm`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Why does `ProfileService` connect `Profile Service` to `Appwrite Services & PostForm`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **What connects `$schema`, `oxc`, `react/rules-of-hooks` to the rest of the system?**
  _44 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Core & Routing` be split into smaller, more focused modules?**
  _Cohesion score 0.10017730496453901 - nodes in this community are weakly interconnected._
- **Should `NPM Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._
- **Should `Dev Tooling & Config` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._