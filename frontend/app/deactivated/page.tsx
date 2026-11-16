"use client";

import { Button } from "@wixzel/react";
import { ShieldWarning, Envelope, SignOut } from "@phosphor-icons/react";
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
        <div className="flex min-h-screen flex-col items-center justify-center bg-bg p-4 text-center">
            <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-xl bg-card px-8 py-10">
                <span className="grid size-14 place-items-center rounded-lg bg-danger-subtle text-danger-ink [&_svg]:size-7">
                    <ShieldWarning />
                </span>
                <div className="flex flex-col gap-2">
                    <h1 className="text-heading-xl">{t("deactivated.title")}</h1>
                    <p className="text-body-md text-fg-muted">{t("deactivated.description")}</p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:flex-row">
                    <Button
                        className="flex-1"
                        iconStart={<Envelope />}
                        onClick={() => window.location.href = `mailto:${supportEmail}`}
                    >
                        {t("deactivated.contactSupport")}
                    </Button>
                    <Button variant="ghost" className="flex-1" iconStart={<SignOut />} onClick={handleLogout}>
                        {t("deactivated.logout")}
                    </Button>
                </div>
            </div>
            <p className="mt-8 text-body-sm text-fg-muted">{t("deactivated.mistakeNote")}</p>
        </div>
    );
}
