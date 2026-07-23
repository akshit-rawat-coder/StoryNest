import React from "react";
import { ThreeDot } from "react-loading-indicators";
import useTheme from "../context/useTheme";

function Loader({ variant = "inline", size = "medium", text = "", className = "" }) {
  let isDark = false;
  try {
    const theme = useTheme();
    isDark = theme?.isDark;
  } catch {
    // Context fallback
  }

  // StoryNest indigo brand colors
  const color = isDark ? "#818cf8" : "#4f46e5";

  const sizeMap = {
    small: "small",
    medium: "medium",
    large: "large",
  };

  const selectedSize = sizeMap[size] || "medium";

  if (variant === "full") {
    return (
      <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm transition-all duration-300 dark:bg-slate-950/80 ${className}`}>
        <div className="flex flex-col items-center gap-3 animate-[pulse_1.5s_infinite]">
          <ThreeDot color="#ffffff" size={selectedSize} />
          {text && (
            <p className="text-sm font-semibold tracking-wide text-indigo-600 dark:text-indigo-300">
              {text}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (variant === "button") {
    return (
      <span className={`inline-flex items-center justify-center gap-2 ${className}`}>
        <ThreeDot color="#ffffff" size="small" />
        {text && <span>{text}</span>}
      </span>
    );
  }

  // Default "inline"
  return (
    <div className={`flex flex-col items-center justify-center py-8 gap-3 ${className}`}>
      <ThreeDot color={color} size={selectedSize} />
      {text && (
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {text}
        </p>
      )}
    </div>
  );
}

export default Loader;
