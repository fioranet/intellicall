// Runs before every `npm run build`, so every setup script and the web installer get it.
//
// The web installer updates a server by copying the new release over the old one, so a
// file a release deletes stays behind, however old that release is. `next build` type-checks
// every .tsx file it finds, and the v12 redesign removed the packages the old UI components
// import. Left in place, those files fail the build and the update ends in a 502.
//
// This deletes exactly the source files that some past release shipped and this one doesn't,
// and does nothing on a fresh install. When a release deletes a source file, add it here.

import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const retired = [
    "app/vaul-drawer.css",
    "components/agents/agent-dialog.tsx",
    "components/agents/agent-sheet.tsx",
    "components/app-sidebar.tsx",
    "components/appointments/google-calendar-dialog.tsx",
    "components/chart-area-interactive.tsx",
    "components/component-example.tsx",
    "components/data-table.tsx",
    "components/direction-provider.tsx",
    "components/example.tsx",
    "components/landing/_shared/grid-background.tsx",
    "components/landing/_shared/landing-motion.tsx",
    "components/landing/_shared/parallax-shapes.tsx",
    "components/landing/_shared/watermark.tsx",
    "components/nav-documents.tsx",
    "components/nav-main.tsx",
    "components/nav-secondary.tsx",
    "components/nav-user.tsx",
    "components/paystack-button.tsx",
    "components/section-cards.tsx",
    "components/site-header.tsx",
    "components/ui/alert-dialog.tsx",
    "components/ui/alert.tsx",
    "components/ui/avatar.tsx",
    "components/ui/badge.tsx",
    "components/ui/breadcrumb.tsx",
    "components/ui/button.tsx",
    "components/ui/card.tsx",
    "components/ui/chart.tsx",
    "components/ui/checkbox.tsx",
    "components/ui/combobox.tsx",
    "components/ui/dialog.tsx",
    "components/ui/drawer.tsx",
    "components/ui/dropdown-menu.tsx",
    "components/ui/empty.tsx",
    "components/ui/field.tsx",
    "components/ui/input-group.tsx",
    "components/ui/input.tsx",
    "components/ui/label.tsx",
    "components/ui/progress.tsx",
    "components/ui/scroll-area.tsx",
    "components/ui/select.tsx",
    "components/ui/separator.tsx",
    "components/ui/sheet.tsx",
    "components/ui/sidebar.tsx",
    "components/ui/skeleton.tsx",
    "components/ui/sonner.tsx",
    "components/ui/switch.tsx",
    "components/ui/table.tsx",
    "components/ui/tabs.tsx",
    "components/ui/textarea.tsx",
    "components/ui/toggle-group.tsx",
    "components/ui/toggle.tsx",
    "components/ui/tooltip.tsx",
    "components/settings/integrations-panel.tsx",
    "hooks/use-mobile.ts",
    "lib/api.ts",
    "app/fonts/OFL-Sora.txt",
    "app/fonts/Sora.woff2",
    "components.json",
];

for (const file of retired) rmSync(join(root, file), { force: true });
