import React from "react";
import { cn } from "@/lib/utils";

interface MockFrameProps {
    title?: string;
    toolbar?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}

/**
 * Shared "fake app" chrome for landing mockups: a bordered card with a window title bar.
 * Borders only — no shadows — to keep the minimal/bold look. Decorative and inert.
 */
export function MockFrame({ title, toolbar, children, className }: MockFrameProps) {
    return (
        <div
            aria-hidden
            className={cn("select-none overflow-hidden rounded-2xl border border-border bg-card", className)}
        >
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
                    <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
                    <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
                </div>
                {title && <span className="text-xs font-medium text-muted-foreground">{title}</span>}
                {toolbar && <div className="ml-auto">{toolbar}</div>}
            </div>
            <div className="p-5">{children}</div>
        </div>
    );
}
