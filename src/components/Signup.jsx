import React, { useState } from "react";
import authService from "../appwrite/auth";
import { Link, useNavigate } from "react-router-dom";
import { Button, Input, Logo } from "./index.js";
import { useForm } from "react-hook-form";

function Signup() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
  const { register, handleSubmit } = useForm();

  const create = async (data) => {
    setError("");
    setIsLoading(true);
    try {
      await authService.createAccount(data);
      setAccountCreated(true);
    } catch (error) {
      setError(error.message || "Failed to create account. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Success screen after account creation
  if (accountCreated) {
    return (
      <div className="w-full">
        <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-lg items-center justify-center p-6 sm:p-10 lg:p-12">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm transition-all duration-300 dark:border-slate-700 dark:bg-slate-900/60">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-500/20">
              <svg className="h-8 w-8 text-indigo-600 dark:text-indigo-300" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="mb-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Check your inbox
            </h2>
            <p className="mb-6 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Account created successfully. We sent a verification email to your inbox.
              <br />
              Please verify your email before logging in.
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

  return (
    <div className="w-full">
      <div className="mx-auto grid min-h-[calc(100vh-8rem)] w-full max-w-7xl grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-2">
        <div className="relative hidden overflow-hidden bg-gradient-to-br from-purple-700 via-indigo-700 to-indigo-600 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-indigo-300/20 blur-2xl" />
          <div className="relative">
            <Logo width="170px" />
          </div>
          <div className="relative max-w-md space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-100">
              Join StoryNest
            </p>
            <h1 className="text-4xl font-bold tracking-tight">
              Create your account and start publishing.
            </h1>
            <p className="text-base text-indigo-100/95">
              Build your writing portfolio, organize ideas, and share stories
              with a polished experience.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center p-6 sm:p-10 lg:p-12">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition-all duration-300 dark:border-slate-700 dark:bg-slate-900/60">
            <div className="mb-6 space-y-3 text-center">
              <div className="flex justify-center lg:hidden">
                <Logo width="160px" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Create your account
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Already have an account?{" "}
                <Link
                  to="/login"
                  className="font-medium text-indigo-600 transition-colors duration-200 hover:text-indigo-700 hover:underline dark:text-indigo-300 dark:hover:text-indigo-200"
                >
                  Sign In
                </Link>
              </p>
            </div>

            {error && (
              <p className="mb-5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-400/30 dark:bg-red-500/15 dark:text-red-200">
                {error}
              </p>
            )}

            <form onSubmit={handleSubmit(create)} className="space-y-5">
              <Input
                label="Full Name: "
                placeholder="Enter your full name"
                {...register("name", {
                  required: true,
                })}
              />
              <Input
                label="Email: "
                placeholder="Enter your email"
                type="email"
                {...register("email", {
                  required: true,
                  validate: {
                    matchPatern: (value) =>
                      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(
                        value
                      ) || "Email address must be a valid address",
                  },
                })}
              />
              <Input
                label="Password: "
                type="password"
                placeholder="Enter your password"
                {...register("password", {
                  required: true,
                })}
              />
              <Button
                type="submit"
                className="mt-1 w-full justify-center"
                loading={isLoading}
              >
                Create Account
              </Button>
            </form>

            <div className="mt-6 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-center text-sm text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-200">
              Start writing your first story in minutes.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Signup;
