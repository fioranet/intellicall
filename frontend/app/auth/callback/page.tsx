"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

function AuthCallbackContent() {
    const router = useRouter();
    const t = useTranslations("auth");
    const searchParams = useSearchParams();

    useEffect(() => {
        const token = searchParams.get("token");
        const userData = searchParams.get("user");
        const error = searchParams.get("error");

        if (error) {
            toast.error(t("toast.authFailed"));
            router.push("/login");
            return;
        }

        if (token && userData) {
            try {
                localStorage.setItem("token", token);
                localStorage.setItem("user", userData);
                toast.success(t("toast.loggedIn"));
                router.push("/");
            } catch (e) {
                console.error("Error parsing user data", e);
                toast.error(t("toast.authError"));
                router.push("/login");
            }
        } else {
            // Ideally should not happen if backend redirects correctly
            router.push("/login");
        }
    }, [router, searchParams, t]);

    return (
        <div className="flex min-h-screen items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">{t("callback.completing")}</p>
            </div>
        </div>
    );
}

export default function AuthCallbackPage() {
    return (
        <Suspense fallback={
            <div className="flex min-h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        }>
            <AuthCallbackContent />
        </Suspense>
    );
}
