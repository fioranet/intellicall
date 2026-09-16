"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Settings, LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
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

interface HeaderProps {
    onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
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

    const getInitials = (name: string) => {
        if (!name) return "U";
        const parts = name.split(" ").filter(Boolean);
        if (parts.length === 0) return "U";

        if (parts.length === 1) {
            return parts[0].substring(0, 2).toUpperCase();
        }

        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };

    return (
        <header className="fixed lg:start-64 start-0 end-0 top-0 z-10 h-16 border-b bg-background">
            <div className="flex h-full items-center justify-between px-6">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="lg:hidden"
                        onClick={onMenuClick}
                        aria-label={t("openMenu")}
                    >
                        <Menu className="h-5 w-5" />
                    </Button>
                </div>

                <div className="flex items-center gap-4">
                    <LocaleToggle />
                    <ModeToggle />
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
                                <Avatar>
                                    <AvatarFallback>{user?.name ? getInitials(user.name) : ""}</AvatarFallback>
                                </Avatar>
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-64">
                            <DropdownMenuLabel className="font-normal">
                                <div className="flex flex-col space-y-1">
                                    <p className="text-sm font-medium leading-none">{user?.name || t("user.account")}</p>
                                    <p className="text-xs leading-none text-muted-foreground">
                                        {user?.email || "user@example.com"}
                                    </p>
                                </div>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => router.push("/settings")}>
                                <Settings className="me-2 h-4 w-4" />
                                <span>{t("user.settings")}</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={handleLogout}>
                                <LogOut className="me-2 h-4 w-4" />
                                <span>{t("user.logout")}</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </header>
    );
}
