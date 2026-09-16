"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Users,
    Bot,
    Megaphone,
    Phone,
    UserCog,
    Settings,
    ShieldCheck,
    Hash,
    Server,
    X,
    HeadphonesIcon,
    Database,
    Calendar,
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { dirFor } from "@/i18n/config";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

const mainMenuItems = [
    { key: "dashboard", href: "/dashboard", icon: LayoutDashboard },
    { key: "leads", href: "/leads", icon: Users },
    { key: "phoneNumbers", href: "/phone-numbers", icon: Hash },
    { key: "sipTrunks", href: "/sip-trunks", icon: Server },
    { key: "agents", href: "/agents", icon: Bot },
    { key: "knowledgeBase", href: "/knowledge-base", icon: Database },
    { key: "campaigns", href: "/campaigns", icon: Megaphone },
    { key: "callLogs", href: "/call-logs", icon: Phone },
    { key: "appointments", href: "/appointments", icon: Calendar },
    { key: "support", href: "/support", icon: HeadphonesIcon },
];

const secondaryMenuItems = [
    { key: "admin", href: "/admin", icon: ShieldCheck, adminOnly: true },
    { key: "settings", href: "/settings", icon: Settings },
];

interface SidebarProps {
    isOpen?: boolean;
    onClose?: () => void;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

export function Sidebar({ isOpen, onClose }: SidebarProps) {
    const t = useTranslations("nav");
    const isRtl = dirFor(useLocale()) === "rtl";
    const pathname = usePathname();
    const [user, setUser] = useState<any>(null);
    const [pendingSupportCount, setPendingSupportCount] = useState(0);
    const [myPendingSupportCount, setMyPendingSupportCount] = useState(0);

    useEffect(() => {
        try {
            const userStr = localStorage.getItem("user");
            if (userStr) {
                setUser(JSON.parse(userStr));
            }
        } catch (error) {
            console.error("Error parsing user:", error);
        }
    }, [pathname]);

    useEffect(() => {
        const isAdminUser = user?.role === "admin" || user?.isSuperAdmin;
        if (!isAdminUser) {
            setPendingSupportCount(0);
            return;
        }
        const token = localStorage.getItem("token");
        if (!token) return;
        fetch(`${API_BASE_URL}/support/tickets/pending-count`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((res) => res.json())
            .then((data) => {
                if (data?.status === "success" && typeof data?.data?.count === "number") {
                    setPendingSupportCount(data.data.count);
                }
            })
            .catch(() => setPendingSupportCount(0));
    }, [user?.role, user?.isSuperAdmin, pathname]);

    useEffect(() => {
        if (!user) {
            setMyPendingSupportCount(0);
            return;
        }
        const token = localStorage.getItem("token");
        if (!token) return;
        fetch(`${API_BASE_URL}/support/tickets/my-pending-count`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((res) => res.json())
            .then((data) => {
                if (data?.status === "success" && typeof data?.data?.count === "number") {
                    setMyPendingSupportCount(data.data.count);
                }
            })
            .catch(() => setMyPendingSupportCount(0));
    }, [user, pathname]);

    return (
        <>
            {/* Overlay for mobile */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
                    onClick={onClose}
                />
            )}

            <div className={cn(
                "fixed start-0 top-0 h-screen w-64 border-e bg-background z-50 transition-transform duration-300 lg:translate-x-0 outline-none shadow-xl lg:shadow-none",
                // Off-canvas slides toward the inline-start edge — the right in RTL.
                // Decided here rather than with an `rtl:` variant, because that
                // variant outranks `lg:translate-x-0` and would strand the
                // sidebar off-screen on desktop.
                isOpen ? "translate-x-0" : isRtl ? "translate-x-full" : "-translate-x-full"
            )}>
                <div className="flex h-16 items-center justify-between border-b px-6">
                    <Link href="/" className="flex items-center" onClick={onClose}>
                        <Logo width={160} height={45} />
                    </Link>
                    <Button variant="ghost" size="icon" className="lg:hidden" onClick={onClose} aria-label={t("closeMenu")}>
                        <X className="h-5 w-5" />
                    </Button>
                </div>
                <ScrollArea className="h-[calc(100vh-4rem)]">
                    <div className="flex flex-col h-full justify-between p-4 min-h-[calc(100vh-6rem)]">
                        <nav className="flex flex-col gap-1">
                            {mainMenuItems.map((item) => {
                                const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
                                const Icon = item.icon;
                                const showMyPendingDot = item.href === "/support" && myPendingSupportCount > 0;

                                return (
                                    <Link key={item.href} href={item.href} onClick={onClose}>
                                        <Button
                                            variant={isActive ? "default" : "ghost"}
                                            className={cn(
                                                "w-full justify-start gap-3 relative",
                                                isActive && "bg-primary text-primary-foreground"
                                            )}
                                        >
                                            <Icon className="h-5 w-5" />
                                            {t(`main.${item.key}`)}
                                            {showMyPendingDot && (
                                                <span
                                                    className="absolute end-3 h-2 w-2 rounded-full bg-red-500 shrink-0"
                                                    aria-label={t("badge.myOpenTickets", { count: myPendingSupportCount })}
                                                />
                                            )}
                                        </Button>
                                    </Link>
                                );
                            })}
                        </nav>

                        <nav className="flex flex-col gap-1 pt-4 border-t mt-auto">
                            {secondaryMenuItems.map((item) => {
                                // Check if item is admin only
                                if (item.adminOnly && (!user || (user.role !== 'admin' && !user.isSuperAdmin))) {
                                    return null;
                                }

                                const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
                                const Icon = item.icon;
                                const showPendingDot = item.adminOnly && pendingSupportCount > 0;

                                return (
                                    <Link key={item.href} href={item.href} onClick={onClose}>
                                        <Button
                                            variant={isActive ? "default" : "ghost"}
                                            className={cn(
                                                "w-full justify-start gap-3 relative",
                                                isActive && "bg-primary text-primary-foreground"
                                            )}
                                        >
                                            <Icon className="h-5 w-5" />
                                            {t(`secondary.${item.key}`)}
                                            {showPendingDot && (
                                                <span
                                                    className="absolute end-3 h-2 w-2 rounded-full bg-red-500 shrink-0"
                                                    aria-label={t("badge.pendingTickets", { count: pendingSupportCount })}
                                                />
                                            )}
                                        </Button>
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>
                </ScrollArea>
            </div>
        </>
    );
}
