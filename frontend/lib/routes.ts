/**
 * Routes reachable without an auth token. Shared by AuthProvider (which decides
 * whether to bounce to /login) and DashboardLayout (which decides whether to
 * render the sidebar/header chrome) so the two can never drift apart.
 */
export const PUBLIC_ROUTES = [
    "/",
    "/login",
    "/signup",
    "/auth/callback",
    "/deactivated",
    "/about",
    "/contact",
    "/privacy",
    "/terms",
] as const;

export function isPublicRoute(pathname: string): boolean {
    return (PUBLIC_ROUTES as readonly string[]).includes(pathname);
}
