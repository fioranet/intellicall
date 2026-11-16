// Wixzel UI's class merger: it knows the design system's own utilities
// (text-body-sm next to text-fg, rounded-lg next to corner sizes), which plain
// tailwind-merge would treat as conflicts and drop. Server-safe.
export { cn } from "@wixzel/react/utils"
