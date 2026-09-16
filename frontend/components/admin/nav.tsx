"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
    Users,
    Layers,
    CreditCard,
    ShoppingBag,
    BarChart3,
    Settings as SettingsIcon,
    HeadphonesIcon,
    MessageSquare,
    Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { useTranslations, useLocale } from "next-intl";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

interface NavItemProps {
    href: string;
    label: string;
    icon: any;
    isActive: boolean;
    showPendingDot?: boolean;
}

function NavItem({ href, label, icon: Icon, isActive, showPendingDot }: NavItemProps) {
    const t = useTranslations("nav");
    return (
        <Link
            href={href}
            className={cn(
                "flex items-center gap-2 px-6 py-2 border-b-2 transition-all duration-200 shrink-0 relative",
                isActive
                    ? "border-primary text-primary font-bold bg-primary/5"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
        >
            <Icon className="h-4 w-4" />
            <span className="text-sm">{label}</span>
            {showPendingDot && (
                <span
                    className="absolute end-2 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-red-500 shrink-0"
                    aria-label={t("pendingTickets")}
                />
            )}
        </Link>
    );
}

export function AdminNav({ currentPath }: { currentPath: string }) {
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

    const locale = useLocale();

    const getAdminNavLabel = (href: string, fallback: string) => {
        if (locale === "pt") {
            switch (href) {
                case "/admin": return "Usuários";
                case "/admin/plans": return "Planos";
                case "/admin/gateways": return "Gateways de Pagamento";
                case "/admin/purchases": return "Compras";
                case "/admin/analytics": return "Métricas Globais";
                case "/admin/support": return "Suporte";
                case "/admin/settings": return "Configurações Admin";
                case "/admin/integrations": return "Integrações";
                case "/admin/testimonials": return "Depoimentos";
                default: return fallback;
            }
        }
        return fallback;
    };

    const navItems = [
        { href: "/admin", label: getAdminNavLabel("/admin", "Users"), icon: Users },
        { href: "/admin/plans", label: getAdminNavLabel("/admin/plans", "Plans"), icon: Layers },
        { href: "/admin/gateways", label: getAdminNavLabel("/admin/gateways", "Payment Gateways"), icon: CreditCard },
        { href: "/admin/purchases", label: getAdminNavLabel("/admin/purchases", "Purchases"), icon: ShoppingBag },
        { href: "/admin/analytics", label: getAdminNavLabel("/admin/analytics", "Global Analytics"), icon: BarChart3 },
        { href: "/admin/support", label: getAdminNavLabel("/admin/support", "Support"), icon: HeadphonesIcon },
        { href: "/admin/settings", label: getAdminNavLabel("/admin/settings", "Admin Settings"), icon: SettingsIcon },
        { href: "/admin/integrations", label: getAdminNavLabel("/admin/integrations", "Integrations"), icon: Plug },
        { href: "/admin/testimonials", label: getAdminNavLabel("/admin/testimonials", "Testimonials"), icon: MessageSquare },
    ];

    return (
        <div className="flex items-center border-b mb-6 bg-card/50 overflow-x-auto scrollbar-hide flex-nowrap">
            {navItems.map((item) => (
                <NavItem
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    isActive={currentPath === item.href}
                    showPendingDot={item.href === "/admin/support" && pendingSupportCount > 0}
                />
            ))}
        </div>
    );
}
