"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Users, Stack, CreditCard, ShoppingBag, ChartBar, Gear, Headset, ChatText, Plug } from "@phosphor-icons/react";
import { Tabs, TabsList, TabsTrigger } from "@wixzel/react";

import { useTranslations } from "next-intl";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

export function AdminNav({ currentPath }: { currentPath: string }) {
    const t = useTranslations("nav");
    const [pendingSupportCount, setPendingSupportCount] = useState(0);

    useEffect(() => {
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
    }, [currentPath]);

    const navItems = [
        { href: "/admin", label: "Users", icon: Users },
        { href: "/admin/plans", label: "Plans", icon: Stack },
        { href: "/admin/gateways", label: "Payment Gateways", icon: CreditCard },
        { href: "/admin/purchases", label: "Purchases", icon: ShoppingBag },
        { href: "/admin/analytics", label: "Global Analytics", icon: ChartBar },
        { href: "/admin/support", label: "Support", icon: Headset },
        { href: "/admin/settings", label: "Admin Settings", icon: Gear },
        { href: "/admin/integrations", label: "Integrations", icon: Plug },
        { href: "/admin/testimonials", label: "Testimonials", icon: ChatText },
    ];

    // Route links drawn as inked line tabs: the current page is the selected tab.
    return (
        <Tabs value={currentPath} variant="line" className="min-w-0">
            <TabsList className="max-w-full overflow-x-auto scrollbar-hide">
                {navItems.map(({ href, label, icon: Icon }) => (
                    <TabsTrigger key={href} value={href} asChild>
                        <Link href={href}>
                            <Icon />
                            {label}
                            {href === "/admin/support" && pendingSupportCount > 0 && (
                                <span
                                    className="size-1.5 shrink-0 rounded-full bg-danger"
                                    aria-label={t("pendingTickets")}
                                />
                            )}
                        </Link>
                    </TabsTrigger>
                ))}
            </TabsList>
        </Tabs>
    );
}
