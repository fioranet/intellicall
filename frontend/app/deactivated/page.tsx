"use client";

import { Button } from "@/components/ui/button";
import { ShieldAlert, Mail, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import axios from "axios";
import { useTranslations } from "next-intl";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

export default function DeactivatedPage() {
    const router = useRouter();
    const t = useTranslations("auth");
    const [supportEmail, setSupportEmail] = useState("support@intellicall.ai");

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const response = await axios.get(`${API_BASE_URL}/settings/public`);
                if (response.data?.status === "success") {
                    setSupportEmail(response.data.data.supportEmail || "support@intellicall.ai");
                }
            } catch (err) {
                console.error("Failed to fetch public settings", err);
            }
        };
        fetchSettings();
    }, []);

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        router.push("/login");
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4 text-center">
            <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mb-6">
                <ShieldAlert className="w-10 h-10 text-destructive" />
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-foreground font-sora mb-2">
                {t("deactivated.title")}
            </h1>

            <p className="text-muted-foreground text-lg max-w-md mb-8">
                {t("deactivated.description")}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm">
                <Button
                    variant="outline"
                    className="flex-1 gap-2"
                    onClick={() => window.location.href = `mailto:${supportEmail}`}
                >
                    <Mail className="w-4 h-4" />
                    {t("deactivated.contactSupport")}
                </Button>

                <Button
                    variant="ghost"
                    className="flex-1 gap-2"
                    onClick={handleLogout}
                >
                    <LogOut className="w-4 h-4" />
                    {t("deactivated.logout")}
                </Button>
            </div>

            <p className="mt-12 text-sm text-muted-foreground">
                {t("deactivated.mistakeNote")}
            </p>
        </div>
    );
}
