import React from "react";
import { Card } from "@wixzel/react";
import { cn } from "@/lib/utils";

interface MockFrameProps {
    title?: string;
    toolbar?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}

/**
 * Shared "app screen" for landing mockups: a tonal Wixzel panel with a title row split off by
 * a hairline, built from real Wixzel parts inside. Decorative and inert: `inert` keeps the
 * controls out of the tab order and away from screen readers.
 */
export function MockFrame({ title, toolbar, children, className }: MockFrameProps) {
    return (
        <Card aria-hidden inert className={cn("select-none overflow-hidden", className)}>
            <div className="flex min-h-12 items-center gap-3 border-b border-border px-5 py-2.5">
                {title && <span className="text-body-sm font-medium text-fg-muted">{title}</span>}
                {toolbar && <div className="ms-auto">{toolbar}</div>}
            </div>
            <div className="p-5">{children}</div>
        </Card>
    );
}
