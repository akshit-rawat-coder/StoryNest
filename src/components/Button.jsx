import React from "react";
import { ThreeDot } from "react-loading-indicators";

function Button({
  children,
  type = "button",
  bgColor = "bg-indigo-600",
  textColor = "text-white",
  className = "",
  loading = false,
  disabled = false,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex min-h-10 items-center justify-center rounded-xl px-4 py-2 text-sm font-medium shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:focus:ring-indigo-400 dark:focus:ring-offset-slate-950 ${bgColor} ${textColor} ${className}`}
      {...props}
    >
      {loading ? (
        <ThreeDot color="#ffffff" size="small" />
      ) : (
        children
      )}
    </button>
  );
}

export default Button;
