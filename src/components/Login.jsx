import React, { useState, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login as authLogin } from "../store/authSlice";
import { Button, Input, Logo } from "./index";
import { useDispatch } from "react-redux";
import authService from "../appwrite/auth";
import { useForm } from "react-hook-form";

function Login() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { register, handleSubmit } = useForm();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [verifyRequired, setVerifyRequired] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState("");
  const cooldownRef = useRef(null);

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
      setResendMessage("Verification email sent successfully!");
      startResendCooldown();
    } catch (error) {
      setResendMessage(error.message || "Failed to resend verification email.");
    } finally {
      setResendLoading(false);
    }
  };

  const login = async (data) => {
    setError("");
    setIsLoading(true);
    setVerifyRequired(false);
    try {
      const session = await authService.login(data);
      if (session) {
        const userData = await authService.getCurrentUser();
        if (userData) {
          // Check if email is verified
          if (!userData.emailVerification) {
            // Logout immediately and show verification required message
            await authService.deleteSession();
            setVerifyRequired(true);
          } else {
            dispatch(authLogin({ userData }));
            navigate("/");
          }
        }
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Verification required screen
  if (verifyRequired) {
    return (
      <div className="w-full">
        <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-lg items-center justify-center p-6 sm:p-10 lg:p-12">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm transition-all duration-300 dark:border-slate-700 dark:bg-slate-900/60">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-500/20">
              <svg className="h-8 w-8 text-amber-600 dark:text-amber-300" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0 0v2m0-2h2m-2 0H10m9.364-7.364A9 9 0 1112 3a9 9 0 017.364 4.636z" />
              </svg>
            </div>
            <h2 className="mb-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Email not verified
            </h2>
            <p className="mb-6 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Please verify your email before signing in.
              <br />
              Check your inbox for the verification link.
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

            <button
              type="button"
              onClick={() => setVerifyRequired(false)}
              className="inline-block text-sm font-medium text-indigo-600 transition-colors duration-200 hover:text-indigo-700 hover:underline dark:text-indigo-300 dark:hover:text-indigo-200"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mx-auto grid min-h-[calc(100vh-8rem)] w-full max-w-7xl grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-2">
        <div className="relative hidden overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-purple-300/20 blur-2xl" />
          <div className="relative">
            <Logo width="170px" />
          </div>
          <div className="relative max-w-md space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-100">StoryNest</p>
            <h1 className="text-4xl font-bold tracking-tight">Welcome back to your writing space.</h1>
            <p className="text-base text-indigo-100/95">
              Publish smarter, organize faster, and keep your ideas beautifully structured.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center p-6 sm:p-10 lg:p-12">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition-all duration-300 dark:border-slate-700 dark:bg-slate-900/60">
            <div className="mb-6 space-y-3 text-center">
              <div className="flex justify-center lg:hidden">
                <Logo width="160px" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Sign in to your account</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Don&apos;t have any account?{" "}
                <Link to="/signup" className="font-medium text-indigo-600 transition-colors duration-200 hover:text-indigo-700 hover:underline dark:text-indigo-300 dark:hover:text-indigo-200">
                  Sign Up
                </Link>
              </p>
            </div>

            {error && (
              <p className="mb-5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-400/30 dark:bg-red-500/15 dark:text-red-200">
                {error}
              </p>
            )}

            <form onSubmit={handleSubmit(login)} className="space-y-5">
              <Input
                label="Email:"
                placeholder="Enter your email"
                type="email"
                {...register("email", {
                  required: true,
                  validate: {
                    matchPatter: (value) =>
                      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(value) ||
                      "Email address must be a valid address",
                  },
                })}
              />
              <Input
                label="password"
                type="password"
                placeholder="Enter your password"
                {...register("password", {
                  required: true,
                })}
              />
              <Button type="submit" className="w-full justify-center" loading={isLoading}>
                Sign In
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
