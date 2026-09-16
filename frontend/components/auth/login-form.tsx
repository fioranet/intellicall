"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Field,
    FieldDescription,
    FieldGroup,
    FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
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
            <FieldGroup>
                <div className="flex flex-col items-center gap-1 text-center">
                    <h1 className="text-2xl font-bold">{t("login.title")}</h1>
                    <p className="text-muted-foreground text-xs text-balance">
                        {t("login.subtitle")}
                    </p>
                </div>
                <Field>
                    <FieldLabel htmlFor="email">{t("login.emailLabel")}</FieldLabel>
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
                <Field>
                    <div className="flex items-center">
                        <FieldLabel htmlFor="password">{t("login.passwordLabel")}</FieldLabel>
                        {/* <a
                            href="#"
                            className="ms-auto text-sm underline-offset-4 hover:underline"
                        >
                            Forgot your password?
                        </a> */}
                    </div>
                    <Input
                        id="password"
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        required
                        disabled={isLoading}
                    />
                </Field>
                <div>
                    <Field>
                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                                    {t("login.submitting")}
                                </>
                            ) : (
                                t("login.submit")
                            )}
                        </Button>
                    </Field>
                    <Field>
                        <Button variant="outline" type="button" className="w-full mt-2" disabled={isLoading} asChild>
                            <a href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api"}/auth/google`}>
                                <FcGoogle className="me-2 h-4 w-4" />
                                {t("login.google")}
                            </a>
                        </Button>
                        <FieldDescription className="text-center mt-2">
                            {t("login.noAccount")}{" "}
                            <Link href="/signup" className="underline underline-offset-4 font-medium">
                                {t("login.signupLink")}
                            </Link>
                        </FieldDescription>
                    </Field>
                </div>
            </FieldGroup>
        </form>
    );
}
