"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import { CheckCircle2, Settings as SettingsIcon } from "lucide-react";
import { useSettings } from "@/components/settings-provider";
import { GoogleSheetsDialog } from "@/components/leads/google-sheets-dialog";

export function GoogleSheetsIntegration() {
    const t = useTranslations("settings");
    const searchParams = useSearchParams();
    const router = useRouter();
    const { googleSheetsConnected, googleSheetsConfig, refreshSettings } = useSettings();

    useEffect(() => {
        const p = searchParams.get("google_sheets");
        if (p === "connected") {
            toast.success(t("toast.sheetsConnected"));
            refreshSettings();
            router.replace("/settings");
        } else if (p === "error") {
            toast.error(t("toast.sheetsConnectFailed"));
            router.replace("/settings");
        } else if (p === "not_configured") {
            toast.error(t("toast.googleOAuthNotConfigured"));
            router.replace("/settings");
        } else if (p === "invalid_client_id") {
            // Caught before the redirect, so the admin sees this instead of
            // Google's own "Error 401: invalid_client" page.
            toast.error(t("toast.googleOAuthInvalidClientId"));
            router.replace("/settings");
        }
    }, [searchParams, refreshSettings, router]);

    const sheetName = googleSheetsConfig?.sheetName as string | undefined;
    const lastSynced = googleSheetsConfig?.lastSynced as string | undefined;

    return (
        <Card>
            <CardHeader>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Image src="/images/integrations/sheets.png" alt={t("googleSheets.title")} width={24} height={24} className="shrink-0 h-6 w-6 object-contain" />
                            {t("googleSheets.title")}
                            {googleSheetsConnected && (
                                <Badge variant="outline" className="text-green-700 border-green-200 bg-green-50 ms-2">
                                    <CheckCircle2 className="h-3 w-3 me-1" /> {t("connected")}
                                </Badge>
                            )}
                        </CardTitle>
                        <CardDescription className="mt-1">
                            {t("googleSheets.description")}
                        </CardDescription>
                    </div>
                    <GoogleSheetsDialog
                        onSuccess={refreshSettings}
                        trigger={
                            <Button
                                className={
                                    googleSheetsConnected
                                        ? "shrink-0 gap-2"
                                        : "bg-green-600 hover:bg-green-700 shrink-0 gap-2"
                                }
                                variant={googleSheetsConnected ? "outline" : "default"}
                            >
                                <SettingsIcon className="h-4 w-4" />
                                {googleSheetsConnected ? t("googleSheets.manageSync") : t("googleSheets.connect")}
                            </Button>
                        }
                    />
                </div>
            </CardHeader>
            {googleSheetsConnected && (
                <CardContent>
                    <div className="rounded-xl border p-4 bg-muted/20 text-sm space-y-2">
                        {sheetName ? (
                            <>
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-xs font-bold uppercase text-muted-foreground">{t("googleSheets.activeSheet")}</span>
                                    <span className="font-medium">{sheetName}</span>
                                </div>
                                {lastSynced && (
                                    <div className="flex items-center justify-between gap-4 pt-2 border-t">
                                        <span className="text-xs font-bold uppercase text-muted-foreground">{t("googleSheets.lastSynced")}</span>
                                        <span className="font-medium">{new Date(lastSynced).toLocaleString()}</span>
                                    </div>
                                )}
                            </>
                        ) : (
                            <p className="text-muted-foreground text-xs">
                                {t.rich("googleSheets.noSheet", { b: (chunks) => <span className="font-medium text-foreground">{chunks}</span> })}
                            </p>
                        )}
                    </div>
                </CardContent>
            )}
        </Card>
    );
}
