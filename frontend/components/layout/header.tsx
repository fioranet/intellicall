"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Gear, SignOut } from "@phosphor-icons/react";
import {
    AppHeader,
    Avatar,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    SidebarToggle,
    toast,
} from "@wixzel/react";
import { ModeToggle } from "@/components/mode-toggle";
import { LocaleToggle } from "@/components/locale-toggle";
import { useTranslations } from "next-intl";
import { clearLocaleCookie } from "@/lib/locale-client";

import axios from "axios";

interface User {
    _id: string;
    name: string;
    email: string;
    role?: string;
}

/** The bar above every console page: the phone menu button, language, theme and the account menu. */
export function Header() {
    const t = useTranslations("nav");
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        const fetchUser = async () => {
            const token = localStorage.getItem("token");
            if (!token) {
                setUser(null);
                return;
            }

            try {
                const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";
                const response = await axios.get(`${API_BASE_URL}/users/me`, {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });

                if (response.data.status === "success") {
                    const userData = response.data.data.user;
                    setUser(userData);
                    // Use a safer stringify
                    try {
                        localStorage.setItem("user", JSON.stringify(userData));
                    } catch (e) {
                        console.error("Failed to save user to localStorage", e);
                    }
                }
            } catch (error) {
                console.error("Error fetching user data:", error);

                if (axios.isAxiosError(error)) {
                    console.error("Header fetchUser error:", error.response?.status, error.response?.data);
                }
            }
        };

        // Try to load from local storage first with error handling
        try {
            const localUser = localStorage.getItem("user");
            if (localUser) {
                // Handle case where "undefined" string might have been saved
                if (localUser !== "undefined" && localUser !== "null") {
                    const parsedUser = JSON.parse(localUser);
                    setUser(parsedUser);
                }
            }
        } catch (e) {
            console.error("Error parsing stored user data:", e);
            // Optionally clear bad data
            localStorage.removeItem("user");
        }

        fetchUser();
    }, [pathname]);

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        localStorage.removeItem("leads_selected_tags");
        localStorage.removeItem("leads_visible_columns");
        // Otherwise the next person on a shared machine inherits this user's language.
        clearLocaleCookie();
        toast.success(t("toast.loggedOut"));
        router.push("/login");
    };

    return (
        <AppHeader>
            <SidebarToggle />
            <div className="ms-auto flex items-center gap-1">
                <LocaleToggle />
                <ModeToggle />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="ms-2 flex rounded-full wx-focus" aria-label={user?.name || t("user.account")}>
                            <Avatar name={user?.name || ""} />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                        <DropdownMenuLabel className="flex flex-col gap-0.5 py-1.5">
                            <span className="truncate text-body-sm font-medium text-fg">{user?.name || t("user.account")}</span>
                            <span className="truncate text-caption font-normal text-fg-muted">{user?.email || "user@example.com"}</span>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => router.push("/settings")}>
                            <Gear />
                            <span>{t("user.settings")}</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem tone="danger" onClick={handleLogout}>
                            <SignOut />
                            <span>{t("user.logout")}</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </AppHeader>
    );
}
