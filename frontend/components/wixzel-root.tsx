"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Toaster, WixzelProvider } from "@wixzel/react";

/**
 * Wixzel UI around the app: Phosphor duotone icons, tooltip timing, the reading
 * direction for every menu and dialog, the words its components write
 * themselves (in the reader's language), and the toaster.
 *
 * The toaster goes before the page, so it is listening when a page shows a
 * toast as it mounts (Sonner keeps none for later). Right to left, toasts stack
 * in the bottom-left corner.
 */
export function WixzelRoot({ dir, children }: { dir: "ltr" | "rtl"; children: React.ReactNode }) {
    const t = useTranslations("common");
    const labels = useMemo(
        () => ({
            close: t("actions.close"),
            moreInformation: t("ui.moreInformation"),
            copy: t("actions.copy"),
            copied: t("actions.copied"),
            reveal: t("ui.reveal"),
            hide: t("ui.hide"),
            breadcrumb: t("ui.breadcrumb"),
            loading: t("states.loading"),
            search: t("actions.search"),
            noResults: t("states.noResults"),
            steps: t("ui.steps"),
            stepDone: t("actions.done"),
            stepError: t("ui.stepError"),
            confirm: t("actions.confirm"),
            cancel: t("actions.cancel"),
            // Kept raw: Wixzel fills in {text} itself.
            typeToConfirm: t.raw("ui.typeToConfirm") as string,
            navigation: t("ui.navigation"),
            collapseSidebar: t("ui.collapseSidebar"),
            expandSidebar: t("ui.expandSidebar"),
            openMenu: t("actions.openMenu"),
        }),
        [t],
    );
    return (
        <WixzelProvider dir={dir} labels={labels}>
            <Toaster
                dir={dir}
                position={dir === "rtl" ? "bottom-left" : "bottom-right"}
                containerAriaLabel={t("ui.notifications")}
            />
            {children}
        </WixzelProvider>
    );
}
