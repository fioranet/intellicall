"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { cn } from "@/lib/utils";
import { Button, Field, Input, toast } from "@wixzel/react";
import { GoogleMark } from "@/components/auth/google-mark";
import { useTranslations } from "next-intl";

export function LoginForm({
    className,
    ...props
}: React.ComponentProps<"form">) {
    const router = useRouter();
    const t = useTranslations("auth");
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        email: "",
        password: "",
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";
            const response = await axios.post(`${API_BASE_URL}/users/login`, formData);

            if (response.data.status === "success") {
                localStorage.setItem("token", response.data.token);
                localStorage.setItem("user", JSON.stringify(response.data.data.user));
                toast.success(t("toast.loginSuccess"), { id: "login-toast" });
                router.push("/dashboard");
            }
        } catch (error: any) {
            const errorMessage = error.response?.data?.message || t("toast.loginFailed");
            toast.error(errorMessage, { id: "login-toast" });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form
            className={cn("flex flex-col gap-6", className)}
            onSubmit={handleSubmit}
            {...props}
        >
            <div className="flex flex-col gap-1 text-center">
                <h1 className="text-heading-xl">{t("login.title")}</h1>
                <p className="text-body-sm text-balance text-fg-muted">
                    {t("login.subtitle")}
                </p>
            </div>
            <div className="flex flex-col gap-4">
                <Field label={t("login.emailLabel")}>
                    <Input
                        id="email"
                        type="email"
                        placeholder={t("login.emailPlaceholder")}
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required
                        disabled={isLoading}
                    />
                </Field>
                <Field label={t("login.passwordLabel")}>
                    <Input
                        id="password"
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        required
                        disabled={isLoading}
                    />
                </Field>
            </div>
            <div className="flex flex-col gap-2">
                <Button type="submit" variant="primary" size="lg" block loading={isLoading}>
                    {isLoading ? t("login.submitting") : t("login.submit")}
                </Button>
                <Button size="lg" block disabled={isLoading} iconStart={<GoogleMark className="size-4" />} asChild>
                    <a href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api"}/auth/google`}>
                        {t("login.google")}
                    </a>
                </Button>
            </div>
            <p className="text-center text-body-sm text-fg-muted">
                {t("login.noAccount")}{" "}
                <Link href="/signup" className="font-medium text-accent-ink underline underline-offset-4">
                    {t("login.signupLink")}
                </Link>
            </p>
        </form>
    );
}
