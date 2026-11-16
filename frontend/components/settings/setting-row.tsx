import type { ReactNode } from "react";
import { Label, Section, Spinner } from "@wixzel/react";
import { cn } from "@wixzel/react/utils";

/**
 * One setting on its own row: the label and a line of help on the start,
 * the control (a Switch, a Select) on the end, and anything that opens
 * under it below. Rows stack inside a panel, split by hairlines.
 *
 * Wixzel has no settings row yet, so this is composed from its Label and
 * token utilities (listed in the IntelliCall gaps).
 */
export function SettingRow({
    htmlFor,
    label,
    description,
    control,
    children,
    className,
}: {
    htmlFor?: string;
    label: ReactNode;
    description?: ReactNode;
    control?: ReactNode;
    children?: ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0", className)}>
            <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-0.5">
                    <Label htmlFor={htmlFor}>{label}</Label>
                    {description && <p className="text-caption text-fg-muted">{description}</p>}
                </div>
                {control && <div className="flex shrink-0 items-center">{control}</div>}
            </div>
            {children}
        </div>
    );
}

/** Rows of settings split by hairlines. `inset` puts them on a lighter panel inside a Section. */
export function SettingRows({ inset, className, children }: { inset?: boolean; className?: string; children: ReactNode }) {
    return (
        <div className={cn("flex flex-col divide-y divide-border", inset && "rounded-md bg-surface p-4", className)}>
            {children}
        </div>
    );
}

/** A settings panel while its status loads: the ring spinner and a word. */
export function SectionLoading({ children }: { children: ReactNode }) {
    return (
        <Section>
            <div className="flex items-center justify-center gap-2 py-10 text-body-sm text-fg-muted">
                <Spinner /> {children}
            </div>
        </Section>
    );
}
