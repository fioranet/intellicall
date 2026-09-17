"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { useTranslations } from "next-intl";

export function ModeToggle() {
    const t = useTranslations("common");
    const { theme, setTheme, resolvedTheme } = useTheme()

    return (
        <Button
            variant="ghost"
            size="icon"
            className="rounded-full w-10 h-10 hover:bg-muted transition-colors"
            onClick={() => setTheme((resolvedTheme || theme) === "dark" ? "light" : "dark")}
        >
            <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">{t("actions.toggleTheme")}</span>
        </Button>
    )
}
