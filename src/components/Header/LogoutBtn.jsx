import React, { useState } from "react";
import { ThreeDot } from "react-loading-indicators";
import { useDispatch } from "react-redux";
import authService from "../../appwrite/auth";
import { logout } from "../../store/authSlice";

function LogoutBtn({ className = "", children = "Logout", onAfterLogout }) {
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(false);

  const logoutHandler = async () => {
    setIsLoading(true);
    try {
      await authService.logout();
      dispatch(logout());
      if (onAfterLogout) {
        onAfterLogout();
      }
    } catch {
      // Logout errors are non-blocking
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      disabled={isLoading}
      className={`inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white ${className}`}
      onClick={logoutHandler}
      type="button"
    >
      {isLoading ? <ThreeDot color="#6366F1" size="small" /> : children}
    </button>
  );
}

export default LogoutBtn;
