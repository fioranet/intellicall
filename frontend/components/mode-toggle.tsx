"use client"

import * as React from "react"
import { Moon, Sun } from "@phosphor-icons/react";
import { useTheme } from "next-themes"
import { Button, Tooltip } from "@wixzel/react";
import { useTranslations } from "next-intl";

export function ModeToggle() {
    const t = useTranslations("common");
    const { theme, setTheme } = useTheme()

    return (
        <Tooltip content={t("actions.toggleTheme")}>
            <Button
                variant="ghost"
                size="icon"
                aria-label={t("actions.toggleTheme")}
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
                <Sun className="dark:hidden" />
                <Moon className="hidden dark:block" />
            </Button>
        </Tooltip>
    )
}
