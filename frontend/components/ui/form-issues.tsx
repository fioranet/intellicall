import { Alert } from "@wixzel/react";
import { cn } from "@/lib/utils";

export type FormIssue = { level: "error" | "warning"; message: string };

/** A next-intl translator for one namespace, as the form checks in lib/ take it. */
export type Translate = (key: string, values?: Record<string, string | number>) => string;

export const hasErrors = (issues: FormIssue[]) => issues.some((i) => i.level === "error");

/**
 * The problems a form can see before Save. Errors block saving; warnings are things that
 * usually make calls fail but might be intended.
 */
export function FormIssues({ issues, className }: { issues: FormIssue[]; className?: string }) {
    if (issues.length === 0) return null;
    const sorted = [...issues].sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
    return (
        <div className={cn("grid gap-1.5", className)}>
            {sorted.map((issue) => (
                <Alert key={issue.message} tone={issue.level === "error" ? "danger" : "warning"}>
                    {issue.message}
                </Alert>
            ))}
        </div>
    );
}
