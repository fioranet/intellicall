"use client";

import { Direction } from "radix-ui";
import { DirectionProvider as BaseUIDirectionProvider } from "@base-ui/react/direction-provider";

/**
 * Radix and Base UI position their popovers in JS, so they need to be told the
 * direction explicitly — the `dir` attribute on <html> only drives CSS. Without
 * this, every align="end" dropdown stays pinned to the physical right in RTL.
 */
export function DirectionProvider({
    dir,
    children,
}: {
    dir: "ltr" | "rtl";
    children: React.ReactNode;
}) {
    return (
        <Direction.Provider dir={dir}>
            <BaseUIDirectionProvider direction={dir}>{children}</BaseUIDirectionProvider>
        </Direction.Provider>
    );
}
