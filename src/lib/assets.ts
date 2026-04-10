// Helper to resolve public asset paths with the correct base URL
// Works both in dev (/) and production (/group-grocer-mate/)
const base = import.meta.env.BASE_URL;

export const appLogo = `${base}app-logo.png`;
export const appIcon = `${base}app-icon.png`;
