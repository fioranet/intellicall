"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@wixzel/react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { isPublicRoute } from "@/lib/routes";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    // Public pages render bare — no sidebar/header chrome.
    const isAuthPage = isPublicRoute(pathname);

    if (isAuthPage) {
        return <>{children}</>;
    }

    // AppShell keeps the sidebar on the page from the md breakpoint up and puts
    // it in a drawer on phones; following a link from the drawer closes it.
    return (
        <AppShell sidebar={<Sidebar />} header={<Header />}>
            <div className="mx-auto w-full max-w-[1400px] px-6 pb-12 pt-2 max-md:px-4">{children}</div>
        </AppShell>
    );
}
