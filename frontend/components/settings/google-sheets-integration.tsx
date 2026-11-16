"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { Badge, Button, DescriptionList, Section, toast } from "@wixzel/react";
import Image from "next/image";
import { Gear } from "@phosphor-icons/react";
import { useSettings } from "@/components/settings-provider";
import { GoogleSheetsDialog } from "@/components/leads/google-sheets-dialog";

export function GoogleSheetsIntegration() {
    const t = useTranslations("settings");
    const searchParams = useSearchParams();
    const router = useRouter();
    // The card is mounted on /integrations now and used to live on /settings: clear the query where it is.
    const pathname = usePathname();
    const { googleSheetsConnected, googleSheetsConfig, refreshSettings } = useSettings();

    useEffect(() => {
        const p = searchParams.get("google_sheets");
        if (p === "connected") {
            toast.success(t("toast.sheetsConnected"));
            refreshSettings();
            router.replace(pathname);
        } else if (p === "error") {
            toast.error(t("toast.sheetsConnectFailed"));
            router.replace(pathname);
        } else if (p === "not_configured") {
            toast.error(t("toast.googleOAuthNotConfigured"));
            router.replace(pathname);
        } else if (p === "invalid_client_id") {
            // Caught before the redirect, so the admin sees this instead of
            // Google's own "Error 401: invalid_client" page.
            toast.error(t("toast.googleOAuthInvalidClientId"));
            router.replace(pathname);
        }
    }, [searchParams, refreshSettings, router, pathname]);

    const sheetName = googleSheetsConfig?.sheetName as string | undefined;
    const lastSynced = googleSheetsConfig?.lastSynced as string | undefined;

    return (
        <Section
            icon={<Image src="/images/integrations/sheets.png" alt={t("googleSheets.title")} width={16} height={16} className="size-4 object-contain" />}
            title={
                <span className="flex flex-wrap items-center gap-2">
                    {t("googleSheets.title")}
                    {googleSheetsConnected && <Badge tone="success" dot>{t("connected")}</Badge>}
                </span>
            }
            description={t("googleSheets.description")}
            actions={
                <GoogleSheetsDialog
                    onSuccess={refreshSettings}
                    trigger={
                        <Button variant={googleSheetsConnected ? "secondary" : "primary"} iconStart={<Gear />}>
                            {googleSheetsConnected ? t("googleSheets.manageSync") : t("googleSheets.connect")}
                        </Button>
                    }
                />
            }
        >
            {googleSheetsConnected && (
                <div className="rounded-md bg-surface p-4 text-body-sm">
                    {sheetName ? (
                        <DescriptionList
                            items={[
                                { term: t("googleSheets.activeSheet"), value: sheetName },
                                ...(lastSynced ? [{ term: t("googleSheets.lastSynced"), value: new Date(lastSynced).toLocaleString() }] : []),
                            ]}
                        />
                    ) : (
                        <p className="text-caption text-fg-muted">
                            {t.rich("googleSheets.noSheet", { b: (chunks) => <span className="font-medium text-fg">{chunks}</span> })}
                        </p>
                    )}
                </div>
            )}
        </Section>
    );
}
