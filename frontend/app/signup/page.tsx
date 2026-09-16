"use client";

import { Logo } from "@/components/ui/logo";
import { SignupForm } from "@/components/auth/signup-form";
import { useTranslations } from "next-intl";

export default function SignupPage() {
    const t = useTranslations("auth");
    return (
        <div className="grid min-h-svh lg:grid-cols-2">
            <div className="flex flex-col gap-4 p-6 md:p-10">
                <div className="flex justify-center gap-2 md:justify-start">
                    <a href="/" className="flex items-center gap-2 font-medium">
                        <Logo width={180} height={50} />
                    </a>
                </div>
                <div className="flex flex-1 items-center justify-center">
                    <div className="w-full max-w-xs">
                        <SignupForm />
                    </div>
                </div>
            </div>
            <div className="bg-muted relative hidden lg:block overflow-hidden">
                <img
                    src="/images/auth-bg.png"
                    alt={t("backgroundAlt")}
                    className="absolute inset-0 h-full w-full object-cover"
                />
            </div>
        </div>
    );
}
