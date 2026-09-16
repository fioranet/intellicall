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

export function SignupForm({
    className,
    ...props
}: React.ComponentProps<"form">) {
    const router = useRouter();
    const t = useTranslations("auth");
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (formData.password.length < 8) {
            toast.error(t("toast.passwordTooShort"), { id: "signup-toast" });
            return;
        }

        setIsLoading(true);

        try {
            const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";
            const response = await axios.post(`${API_BASE_URL}/users/signup`, formData);

            if (response.data.status === "success") {
                localStorage.setItem("token", response.data.token);
                localStorage.setItem("user", JSON.stringify(response.data.data.user));
                toast.success(t("toast.signupSuccess"), { id: "signup-toast" });
                router.push("/dashboard");
            }
        } catch (error: any) {
            const errorMessage = error.response?.data?.message || t("toast.signupFailed");
            toast.error(errorMessage, { id: "signup-toast" });
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
                    <h1 className="text-2xl font-bold">{t("signup.title")}</h1>
                    <p className="text-muted-foreground text-xs text-balance">
                        {t("signup.subtitle")}
                    </p>
                </div>
                <Field>
                    <FieldLabel htmlFor="name">{t("signup.nameLabel")}</FieldLabel>
                    <Input
                        id="name"
                        type="text"
                        placeholder={t("signup.namePlaceholder")}
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                        disabled={isLoading}
                    />
                </Field>
                <Field>
                    <FieldLabel htmlFor="email">{t("signup.emailLabel")}</FieldLabel>
                    <Input
                        id="email"
                        type="email"
                        placeholder={t("signup.emailPlaceholder")}
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required
                        disabled={isLoading}
                    />
                </Field>
                <Field>
                    <FieldLabel htmlFor="password">{t("signup.passwordLabel")}</FieldLabel>
                    <Input
                        id="password"
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        required
                        disabled={isLoading}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                        {t("signup.passwordHint")}
                    </p>
                </Field>
                <div>
                    <Field>
                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                                    {t("signup.submitting")}
                                </>
                            ) : (
                                t("signup.submit")
                            )}
                        </Button>
                    </Field>
                    <Field>
                        <Button variant="outline" type="button" className="w-full mt-2" disabled={isLoading} asChild>
                            <a href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api"}/auth/google`}>
                                <FcGoogle className="me-2 h-4 w-4" />
                                {t("signup.google")}
                            </a>
                        </Button>
                        <FieldDescription className="text-center mt-2">
                            {t("signup.hasAccount")}{" "}
                            <Link href="/login" className="underline underline-offset-4 font-medium">
                                {t("signup.loginLink")}
                            </Link>
                        </FieldDescription>
                    </Field>
                </div>
            </FieldGroup>
        </form>
    );
}
