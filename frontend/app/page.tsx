"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RootPage() {
    const router = useRouter();

    useEffect(() => {
        const token = localStorage.getItem("token");
        if (token) {
            router.replace("/dashboard");
        } else {
            router.replace("/login");
        }
    }, [router]);

    return (
        <div className="flex h-screen w-screen items-center justify-center bg-background">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
    );
}
