"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { isPublicRoute } from "@/lib/routes";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    // Public pages render bare — no sidebar/header chrome.
    const isAuthPage = isPublicRoute(pathname);

    // Close sidebar on navigation for mobile
    useEffect(() => {
        setIsSidebarOpen(false);
    }, [pathname]);

    if (isAuthPage) {
        return <>{children}</>;
    }

    return (
        <div className="min-h-screen bg-background">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
            <Header onMenuClick={() => setIsSidebarOpen(true)} />
            <main className="lg:ms-64 mt-16 p-6">
                {children}
            </main>
        </div>
    );
}
