import React, { useState } from "react";
import authService from "../appwrite/auth";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../store/authSlice";
import { Button, Input, Logo } from "./index.js";
import { useDispatch } from "react-redux";
import { useForm } from "react-hook-form";

function Signup() {
    const navigate = useNavigate();
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const dispatch = useDispatch();
    const { register, handleSubmit } = useForm();

    const create = async (data) => {
        setError("");
        setIsLoading(true);
        try {
            const userData = await authService.createAccount(data);
            if (userData) {
                const userData = await authService.getCurrentUser();
                if (userData) dispatch(login({ userData }));
                navigate("/");
            }
        } catch (error) {
            setError(error.message);
        } finally {
            setIsLoading(false);
        }
    };

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
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-100">Join StoryNest</p>
                        <h1 className="text-4xl font-bold tracking-tight">Create your account and start publishing.</h1>
                        <p className="text-base text-indigo-100/95">
                            Build your writing portfolio, organize ideas, and share stories with a polished experience.
                        </p>
                    </div>
                </div>

                <div className="flex items-center justify-center p-6 sm:p-10 lg:p-12">
                    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition-all duration-300 dark:border-slate-700 dark:bg-slate-900/60">
                        <div className="mb-6 space-y-3 text-center">
                            <div className="flex justify-center lg:hidden">
                                <Logo width="160px" />
                            </div>
                            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Create your account</h2>
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                                Already have an account?{" "}
                                <Link to="/login" className="font-medium text-indigo-600 transition-colors duration-200 hover:text-indigo-700 hover:underline dark:text-indigo-300 dark:hover:text-indigo-200">
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
                                            /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(value) ||
                                            "Email address must be a valid address",
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
                            <Button type="submit" className="mt-1 w-full justify-center" loading={isLoading}>
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