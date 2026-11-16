"use client";

import Link from "next/link";
import { useSettings } from "@/components/settings-provider";
import { Logo } from "@/components/ui/logo";

/**
 * The lockup every public band carries: this site's own logo, home. The image and the
 * name both come from the branding settings, so a buyer's upload names its own link.
 * It lives here, and not in each header, because it is the part most likely to drift.
 */
export function ChromeLockup() {
    const { branding } = useSettings();

    return (
        <Link
            href="/"
            aria-label={branding.appName}
            className="inline-flex items-center rounded-sm wx-focus transition-opacity duration-(--wx-duration-fast) hover:opacity-80"
        >
            <Logo width={160} height={40} variant="auto" />
        </Link>
    );
}
