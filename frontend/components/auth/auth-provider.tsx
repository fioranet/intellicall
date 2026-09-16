"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import axios from "axios";
import { isPublicRoute } from "@/lib/routes";

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        // Axios interceptor for deactivation
        const interceptor = axios.interceptors.response.use(
            (response) => response,
            (error) => {
                if (error.response?.status === 401 && error.response?.data?.message?.toLowerCase().includes("deactivated")) {
                    router.push("/deactivated");
                }
                return Promise.reject(error);
            }
        );

        const isPublic = isPublicRoute(pathname);
        const isAuthenticated = typeof window !== "undefined" && !!localStorage.getItem("token");
        const userStr = typeof window !== "undefined" ? localStorage.getItem("user") : null;
        const user = userStr ? JSON.parse(userStr) : null;

        // Redirect if deactivated
        if (user && user.isActive === false && pathname !== "/deactivated") {
            router.push("/deactivated");
            return;
        }

        // Only redirect to login if it's not a public route
        if (!isPublic && !isAuthenticated) {
            router.push("/login");
        }
        // If authenticated and trying to access login or signup, go to dashboard
        else if (isAuthenticated && (pathname === "/login" || pathname === "/signup")) {
            router.push("/dashboard");
        }

        // Protect /admin routes
        if (pathname.startsWith("/admin")) {
            if (user) {
                if (user.role !== "admin" && !user.isSuperAdmin) {
                    router.push("/dashboard");
                }
            } else {
                router.push("/dashboard");
            }
        }

        return () => {
            axios.interceptors.response.eject(interceptor);
        };
    }, [pathname, router]);

    return <>{children}</>;
}
