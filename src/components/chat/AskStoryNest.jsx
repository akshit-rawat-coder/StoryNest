import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import ragService from "../../services/ragService";

const GLOBAL_SUGGESTIONS = [
  "What technologies are used to build StoryNest?",
  "How does the platform manage authentication and storage?",
  "How is AI integrated into the writing workflow?",
];

const ARTICLE_SUGGESTIONS = [
  "Can you summarize the main points of this article?",
  "What are the key technical takeaways?",
  "What architecture or tools are discussed here?",
];

/**
 * Lightweight inline markdown renderer for AI answers
 */
function FormattedAnswer({ text }) {
  if (!text) return null;

  const paragraphs = text.split(/\n\n+/);

  return (
    <div className="space-y-2.5 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
      {paragraphs.map((para, pIdx) => {
        const trimmed = para.trim();
        if (!trimmed) return null;

        // Numbered list
        if (/^\d+[.)]\s/.test(trimmed)) {
          const items = trimmed.split(/\n(?=\d+[.)]\s)/);
          return (
            <ol key={pIdx} className="list-decimal pl-5 space-y-1.5">
              {items.map((item, iIdx) => {
                const cleaned = item.replace(/^\d+[.)]\s*/, "");
                return <li key={iIdx}>{renderInline(cleaned)}</li>;
              })}
            </ol>
          );
        }

        // Bullet list
        if (/^[-*•]\s/.test(trimmed)) {
          const items = trimmed.split(/\n(?=[-*•]\s)/);
          return (
            <ul key={pIdx} className="list-disc pl-5 space-y-1.5">
              {items.map((item, iIdx) => {
                const cleaned = item.replace(/^[-*•]\s*/, "");
                return <li key={iIdx}>{renderInline(cleaned)}</li>;
              })}
            </ul>
          );
        }

        // Paragraph
        return <p key={pIdx}>{renderInline(trimmed)}</p>;
      })}
    </div>
  );
}

/**
 * Formats bold and inline code spans
 */
function renderInline(str) {
  const parts = [];
  const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = tokenRegex.exec(str)) !== null) {
    if (match.index > lastIndex) {
      parts.push(str.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={key++} className="font-semibold text-slate-900 dark:text-white">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code
          key={key++}
          className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-xs text-indigo-700 dark:bg-slate-800 dark:text-indigo-300"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < str.length) {
    parts.push(str.substring(lastIndex));
  }

  return parts.length > 0 ? parts : str;
}

export default function AskStoryNest() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(() => {
    try {
      const saved = sessionStorage.getItem("storynest_rag_chat_history");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [inputQuestion, setInputQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorNotice, setErrorNotice] = useState(null);

  // Article-aware context
  const [articleContext, setArticleContext] = useState(null);
  const [scopeMode, setScopeMode] = useState("all");

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Save conversation history to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem("storynest_rag_chat_history", JSON.stringify(messages));
    } catch {
      // Ignore quota errors
    }
  }, [messages]);

  // Listen to article context events from Post page
  useEffect(() => {
    const handleArticleContext = (e) => {
      if (e.detail && e.detail.id) {
        setArticleContext(e.detail);
        setScopeMode("article");
      } else {
        setArticleContext(null);
        setScopeMode("all");
      }
    };

    window.addEventListener("storynest:article-context", handleArticleContext);
    return () => {
      window.removeEventListener("storynest:article-context", handleArticleContext);
    };
  }, []);

  // When navigating away from /post/, reset article scope
  useEffect(() => {
    if (!location.pathname.startsWith("/post/")) {
      setArticleContext(null);
      setScopeMode("all");
    }
  }, [location.pathname]);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading, isOpen]);

  // Focus textarea when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const handleSend = async (questionText, overrideMode = null) => {
    const q = (questionText || inputQuestion).trim();
    if (!q || isLoading) return;

    const currentMode = overrideMode || (articleContext ? scopeMode : "all");
    const contextArticleId = currentMode === "article" && articleContext ? articleContext.id : null;

    setErrorNotice(null);
    setInputQuestion("");

    // Add user message to conversation
    const userMsg = {
      id: "u_" + Date.now(),
      role: "user",
      content: q,
      mode: currentMode,
      articleTitle: currentMode === "article" ? articleContext?.title : null,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const response = await ragService.askQuestion(q, {
        mode: currentMode,
        contextArticleId,
      });

      const assistantMsg = {
        id: "a_" + Date.now(),
        role: "assistant",
        content: response.answer,
        sources: response.sources || [],
        insufficientContext: response.insufficientContext,
        mode: response.mode || currentMode,
        contextArticleId: response.contextArticleId,
        articleTitle: currentMode === "article" ? articleContext?.title : null,
        originalQuestion: q,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setErrorNotice({
        message: err.message || "Failed to get an answer. Please try again.",
        failedQuestion: q,
        mode: currentMode,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setErrorNotice(null);
    try {
      sessionStorage.removeItem("storynest_rag_chat_history");
    } catch {
      // Ignore
    }
  };

  const handleSourceClick = (e, articleId) => {
    e.preventDefault();
    if (articleId) {
      navigate(`/post/${articleId}`);
      if (window.innerWidth < 640) {
        setIsOpen(false);
      }
    }
  };

  const activeSuggestions =
    articleContext && scopeMode === "article" ? ARTICLE_SUGGESTIONS : GLOBAL_SUGGESTIONS;

  return (
    <>
      {/* Floating Chat Launcher Button (Bottom Right) */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          aria-label={isOpen ? "Close Ask StoryNest" : "Open Ask StoryNest"}
          className="group relative flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition-all duration-300 hover:scale-105 hover:bg-indigo-700 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-indigo-500/30 dark:focus:ring-indigo-400/30"
        >
          {/* Subtle online beacon badge */}
          <span className="absolute right-0 top-0 flex h-3.5 w-3.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900"></span>
          </span>

          {isOpen ? (
            <svg
              className="h-6 w-6 transition-transform duration-200 group-hover:rotate-90"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg
              className="h-6 w-6 transition-transform duration-200 group-hover:scale-110"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v5.01z"
              />
            </svg>
          )}
        </button>
      </div>

      {/* Expandable Chat Panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Ask StoryNest Assistant"
          className="fixed bottom-24 right-4 z-50 flex h-[600px] max-h-[84vh] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all duration-200 dark:border-slate-800 dark:bg-slate-900 sm:right-6 sm:w-[420px] md:w-[450px]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-850">
            <div className="flex items-center space-x-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Ask StoryNest</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">RAG article assistant</p>
              </div>
            </div>

            <div className="flex items-center space-x-1">
              {/* Clear chat button */}
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearChat}
                  title="Clear conversation"
                  aria-label="Clear conversation"
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                    />
                  </svg>
                </button>
              )}

              {/* Close button */}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Minimize chat"
                aria-label="Minimize chat"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
            </div>
          </div>

          {/* Article Context & Mode Switcher Bar */}
          {articleContext && (
            <div className="flex items-center justify-between border-b border-indigo-100 bg-indigo-50/70 px-3.5 py-2 text-xs dark:border-slate-800 dark:bg-indigo-950/20">
              <div className="flex min-w-0 flex-1 items-center space-x-1.5 pr-2">
                <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                  Article:
                </span>
                <span
                  className="truncate font-medium text-slate-800 dark:text-slate-200"
                  title={articleContext.title}
                >
                  {articleContext.title}
                </span>
              </div>

              {/* Scope Switcher Pill */}
              <div className="inline-flex shrink-0 rounded-lg bg-slate-200/80 p-0.5 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setScopeMode("article")}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                    scopeMode === "article"
                      ? "bg-white text-indigo-700 shadow-xs dark:bg-slate-700 dark:text-indigo-300"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  This Article
                </button>
                <button
                  type="button"
                  onClick={() => setScopeMode("all")}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                    scopeMode === "all"
                      ? "bg-white text-indigo-700 shadow-xs dark:bg-slate-700 dark:text-indigo-300"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  All Articles
                </button>
              </div>
            </div>
          )}

          {/* Conversation History / Body */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {/* Welcome State when no messages */}
            {messages.length === 0 && (
              <div className="my-auto flex flex-col items-center justify-center pt-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 shadow-sm dark:bg-indigo-950/40 dark:text-indigo-400">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                    />
                  </svg>
                </div>

                <h4 className="mt-3 text-base font-semibold text-slate-900 dark:text-white">Ask StoryNest</h4>
                <p className="mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">
                  {articleContext && scopeMode === "article"
                    ? `Ask anything about "${articleContext.title}".`
                    : "Hi! I'm Ask StoryNest. Ask me anything about the articles published on StoryNest."}
                </p>

                {/* Suggested prompt chips */}
                <div className="mt-4 w-full space-y-2 text-left">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Suggested Questions
                  </p>
                  {activeSuggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSend(suggestion)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 text-left text-xs font-medium text-slate-700 transition duration-150 hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-950/20 dark:hover:text-indigo-300"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Render Chat Messages */}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
              >
                {/* Mode chip for user queries */}
                {msg.role === "user" && msg.mode === "article" && (
                  <span className="mb-1 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300">
                    Scope: This Article
                  </span>
                )}

                {/* Message Bubble */}
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
                    msg.role === "user"
                      ? "rounded-tr-sm bg-indigo-600 text-white"
                      : "rounded-tl-sm border border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  }`}
                >
                  {msg.role === "user" ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <>
                      {/* Notice if context is insufficient */}
                      {msg.insufficientContext && (
                        <div className="mb-2.5 space-y-2">
                          <div className="flex items-center space-x-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                            <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <span>
                              {msg.mode === "article"
                                ? "Not answered in this article"
                                : "Limited information in articles"}
                            </span>
                          </div>

                          {/* Quick button to search across all articles if asked in article mode */}
                          {msg.mode === "article" && msg.originalQuestion && (
                            <button
                              type="button"
                              onClick={() => {
                                setScopeMode("all");
                                handleSend(msg.originalQuestion, "all");
                              }}
                              className="inline-flex w-full items-center justify-center rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/70"
                            >
                              <span>Search All Articles for this question</span>
                              <svg className="ml-1 h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                              </svg>
                            </button>
                          )}
                        </div>
                      )}

                      <FormattedAnswer text={msg.content} />

                      {/* Cited Sources Card List */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-3 border-t border-slate-200/80 pt-2.5 dark:border-slate-700/80">
                          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                            Sources Cited:
                          </p>
                          <div className="space-y-1.5">
                            {msg.sources.map((src, sIdx) => (
                              <button
                                key={sIdx}
                                type="button"
                                onClick={(e) => handleSourceClick(e, src.articleId)}
                                className="group flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white p-2 text-left transition hover:border-indigo-400 hover:shadow-xs dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-500"
                              >
                                <div className="min-w-0 flex-1 pr-2">
                                  <p className="truncate text-xs font-semibold text-slate-900 group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400">
                                    {src.title}
                                  </p>
                                  <span className="inline-block rounded bg-indigo-50 px-1.5 py-0.2 text-[10px] font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                                    {src.category || "General"}
                                  </span>
                                </div>
                                <svg
                                  className="h-3.5 w-3.5 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-600 dark:group-hover:text-indigo-400"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                                </svg>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <span className="mt-1 px-1 text-[10px] text-slate-400">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}

            {/* Loading / Generating State */}
            {isLoading && (
              <div className="flex items-start">
                <div className="flex items-center space-x-2 rounded-2xl rounded-tl-sm border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
                  <div className="flex space-x-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-600 [animation-delay:-0.3s]"></span>
                    <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-600 [animation-delay:-0.15s]"></span>
                    <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-600"></span>
                  </div>
                  <span className="text-xs font-medium">
                    {articleContext && scopeMode === "article"
                      ? "Reading this article..."
                      : "Searching StoryNest articles..."}
                  </span>
                </div>
              </div>
            )}

            {/* Inline Error Notice with Retry */}
            {errorNotice && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                <p className="font-medium">{errorNotice.message}</p>
                {errorNotice.failedQuestion && (
                  <button
                    type="button"
                    onClick={() => handleSend(errorNotice.failedQuestion, errorNotice.mode)}
                    className="mt-2 font-semibold text-red-800 underline hover:no-underline dark:text-red-200"
                  >
                    Retry Question
                  </button>
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-850">
            <div className="relative flex items-center rounded-xl border border-slate-200 bg-white shadow-xs focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:focus-within:border-indigo-400">
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputQuestion}
                onChange={(e) => setInputQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  articleContext && scopeMode === "article"
                    ? "Ask about this article..."
                    : "Ask a question about articles..."
                }
                disabled={isLoading}
                className="max-h-24 min-h-[42px] w-full resize-none bg-transparent px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-white dark:placeholder:text-slate-500"
              />

              <button
                type="button"
                onClick={() => handleSend()}
                disabled={isLoading || !inputQuestion.trim()}
                aria-label="Send question"
                className="mr-2 flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white transition hover:bg-indigo-700 disabled:pointer-events-none disabled:opacity-40"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-slate-400 dark:text-slate-500">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      )}
    </>
  );
}

