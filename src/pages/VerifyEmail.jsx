import React, { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import authService from "../appwrite/auth";
import { Button, Logo, Loader } from "../components";

const STATUS = {
  LOADING: "loading",
  SUCCESS: "success",
  ALREADY_VERIFIED: "already_verified",
  ERROR: "error",
};

function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(STATUS.LOADING);
  const [errorMessage, setErrorMessage] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState("");
  const cooldownRef = useRef(null);
  const hasVerified = useRef(false);

  const userId = searchParams.get("userId");
  const secret = searchParams.get("secret");

  const startResendCooldown = useCallback(() => {
    setResendCooldown(30);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current);
          cooldownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleResendVerification = async () => {
    if (resendCooldown > 0) return;
    setResendLoading(true);
    setResendMessage("");
    try {
      await authService.sendVerificationEmail();
      setResendMessage("Verification email sent successfully! Check your inbox.");
      startResendCooldown();
    } catch (error) {
      const msg = error.message || "Failed to resend verification email.";
      // Handle "already verified" case when trying to resend
      if (msg.toLowerCase().includes("already verified")) {
        setStatus(STATUS.ALREADY_VERIFIED);
      } else {
        setResendMessage(msg);
      }
    } finally {
      setResendLoading(false);
    }
  };

  useEffect(() => {
    if (hasVerified.current) return;

    const verifyEmail = async () => {
      // If no userId/secret in URL, show error
      if (!userId || !secret) {
        setStatus(STATUS.ERROR);
        setErrorMessage(
          "Invalid verification link. Please check the link and try again."
        );
        return;
      }

      try {
        hasVerified.current = true;
        await authService.updateVerification(userId, secret);
        setStatus(STATUS.SUCCESS);
      } catch (error) {
        const msg = error.message || "";
        // Handle "already verified" error
        if (
          msg.toLowerCase().includes("already verified") ||
          msg.toLowerCase().includes("user is already verified")
        ) {
          setStatus(STATUS.ALREADY_VERIFIED);
        }
        // Handle expired/invalid link
        else if (
          msg.toLowerCase().includes("invalid") ||
          msg.toLowerCase().includes("expired") ||
          msg.toLowerCase().includes("not found")
        ) {
          setStatus(STATUS.ERROR);
          setErrorMessage(
            "This verification link is invalid or has expired."
          );
        } else {
          setStatus(STATUS.ERROR);
          setErrorMessage(msg || "Verification failed. Please try again.");
        }
      }
    };

    verifyEmail();
  }, [userId, secret]);

  // Loading State
  if (status === STATUS.LOADING) {
    return (
      <div className="w-full">
        <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-lg items-center justify-center p-6 sm:p-10 lg:p-12">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm transition-all duration-300 dark:border-slate-700 dark:bg-slate-900/60">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center">
              <Loader size="large" />
            </div>
            <h2 className="mb-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Verifying your email...
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Please wait while we confirm your email address.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Success State
  if (status === STATUS.SUCCESS) {
    return (
      <div className="w-full">
        <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-lg items-center justify-center p-6 sm:p-10 lg:p-12">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm transition-all duration-300 dark:border-slate-700 dark:bg-slate-900/60">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-500/20">
              <svg
                className="h-8 w-8 text-green-600 dark:text-green-300"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="mb-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Email Verified Successfully
            </h2>
            <p className="mb-6 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Your email has been verified. You can now sign in to your account.
              <br />
              Redirecting to login...
            </p>
            <Link
              to="/login"
              className="inline-block rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-indigo-700 hover:shadow-md"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Already Verified State
  if (status === STATUS.ALREADY_VERIFIED) {
    return (
      <div className="w-full">
        <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-lg items-center justify-center p-6 sm:p-10 lg:p-12">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm transition-all duration-300 dark:border-slate-700 dark:bg-slate-900/60">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-500/20">
              <svg
                className="h-8 w-8 text-blue-600 dark:text-blue-300"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <h2 className="mb-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Already Verified
            </h2>
            <p className="mb-6 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Your email has already been verified. You can log in now.
            </p>
            <Link
              to="/login"
              className="inline-block rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-indigo-700 hover:shadow-md"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Error State - Invalid or Expired Link with Resend Button
  return (
    <div className="w-full">
      <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-lg items-center justify-center p-6 sm:p-10 lg:p-12">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm transition-all duration-300 dark:border-slate-700 dark:bg-slate-900/60">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/20">
            <svg
              className="h-8 w-8 text-red-600 dark:text-red-300"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <h2 className="mb-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Verification Failed
          </h2>
          <p className="mb-6 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {errorMessage || "This verification link is invalid or has expired."}
          </p>

          {resendMessage && (
            <p
              className={`mb-4 rounded-xl border px-3 py-2 text-sm font-medium ${
                resendMessage.includes("successfully")
                  ? "border-green-200 bg-green-50 text-green-700 dark:border-green-400/30 dark:bg-green-500/15 dark:text-green-200"
                  : "border-red-200 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-500/15 dark:text-red-200"
              }`}
            >
              {resendMessage}
            </p>
          )}

          <Button
            type="button"
            className="mb-4 w-full justify-center"
            loading={resendLoading}
            disabled={resendCooldown > 0}
            onClick={handleResendVerification}
          >
            {resendCooldown > 0
              ? `Resend in ${resendCooldown}s`
              : "Resend Verification Email"}
          </Button>

          <Link
            to="/login"
            className="inline-block text-sm font-medium text-indigo-600 transition-colors duration-200 hover:text-indigo-700 hover:underline dark:text-indigo-300 dark:hover:text-indigo-200"
          >
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}

export default VerifyEmail;
