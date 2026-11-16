"use client";

import Link from "next/link";
import { Button, SiteHeader } from "@wixzel/react";
import { CaretLeftIcon } from "@wixzel/react/icons";
import { ChromeLockup } from "@/components/landing/_shared/chrome-lockup";
import { ThemeMenu } from "@/components/theme-menu";

/**
 * The top band of the public content pages (about, contact, privacy, terms): the same
 * shared chrome the landing page wears, with the lockup home, preferences and the way
 * back. No nav: the landing page's items are its own in-page sections, which do not
 * exist here, so the band carries no list of places this page cannot go.
 */
export function PublicPageHeader() {
    return (
        <SiteHeader
            brand={<ChromeLockup />}
            actions={
                <>
                    <ThemeMenu />
                    <Button asChild variant="ghost" size="sm" iconStart={<CaretLeftIcon className="rtl:-scale-x-100" />}>
                        <Link href="/">Back to Home</Link>
                    </Button>
                </>
            }
        />
    );
}
