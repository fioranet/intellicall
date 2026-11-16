"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SquaresFour, Users, Robot, Megaphone, Phone, Gear, ShieldCheck, Hash, HardDrives, Headset, Database, Calendar, Wrench, PuzzlePiece, VideoCamera } from "@phosphor-icons/react";
import { WhatsAppIcon } from "@/components/whatsapp/whatsapp-icon";
import { useTranslations } from "next-intl";
import { Sidebar as WixzelSidebar, SidebarFooter, SidebarHeader, SidebarItem, SidebarSection } from "@wixzel/react";
import { Logo } from "@/components/ui/logo";

const mainMenuItems = [
    { key: "dashboard", href: "/dashboard", icon: SquaresFour },
    { key: "leads", href: "/leads", icon: Users },
    { key: "phoneNumbers", href: "/phone-numbers", icon: Hash },
    { key: "sipTrunks", href: "/sip-trunks", icon: HardDrives, adminOnly: true },
    { key: "whatsapp", href: "/whatsapp", icon: WhatsAppIcon },
    { key: "meetings", href: "/meetings", icon: VideoCamera },
    { key: "agents", href: "/agents", icon: Robot },
    { key: "knowledgeBase", href: "/knowledge-base", icon: Database },
    { key: "tools", href: "/tools", icon: Wrench },
    { key: "integrations", href: "/integrations", icon: PuzzlePiece },
    { key: "campaigns", href: "/campaigns", icon: Megaphone },
    { key: "callLogs", href: "/call-logs", icon: Phone },
    { key: "appointments", href: "/appointments", icon: Calendar },
    { key: "support", href: "/support", icon: Headset },
];

const secondaryMenuItems = [
    { key: "admin", href: "/admin", icon: ShieldCheck, adminOnly: true },
    { key: "settings", href: "/settings", icon: Gear },
];

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

/**
 * The console's nav, inside Wixzel's AppShell: on the page from the md
 * breakpoint up, and in the AppShell's drawer on a phone (following a link
 * closes it).
 */
export function Sidebar() {
    const t = useTranslations("nav");
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

    const isActive = (href: string) => pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
    const isAdminUser = Boolean(user && (user.role === "admin" || user.isSuperAdmin));

    return (
        <WixzelSidebar>
            <SidebarHeader className="pb-4">
                <Link href="/" className="flex h-9 items-center rounded-md wx-focus">
                    <Logo width={140} height={36} />
                </Link>
            </SidebarHeader>
            <SidebarSection>
                {mainMenuItems.map((item: any) => {
                    if (item.adminOnly && !isAdminUser) return null;
                    const Icon = item.icon;
                    const showMyPendingDot = item.href === "/support" && myPendingSupportCount > 0;
                    return (
                        <SidebarItem
                            key={item.href}
                            asChild
                            active={isActive(item.href)}
                            icon={<Icon />}
                            aside={showMyPendingDot && (
                                <span
                                    role="status"
                                    className="size-2 rounded-full bg-danger"
                                    aria-label={t("badge.myOpenTickets", { count: myPendingSupportCount })}
                                />
                            )}
                        >
                            <Link href={item.href}>{t(`main.${item.key}`)}</Link>
                        </SidebarItem>
                    );
                })}
            </SidebarSection>
            <SidebarFooter>
                <SidebarSection>
                    {secondaryMenuItems.map((item) => {
                        if (item.adminOnly && !isAdminUser) return null;
                        const Icon = item.icon;
                        const showPendingDot = item.adminOnly && pendingSupportCount > 0;
                        return (
                            <SidebarItem
                                key={item.href}
                                asChild
                                active={isActive(item.href)}
                                icon={<Icon />}
                                aside={showPendingDot && (
                                    <span
                                        role="status"
                                        className="size-2 rounded-full bg-danger"
                                        aria-label={t("badge.pendingTickets", { count: pendingSupportCount })}
                                    />
                                )}
                            >
                                <Link href={item.href}>{t(`secondary.${item.key}`)}</Link>
                            </SidebarItem>
                        );
                    })}
                </SidebarSection>
            </SidebarFooter>
        </WixzelSidebar>
    );
}
