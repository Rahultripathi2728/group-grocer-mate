// Helper to resolve public asset paths with the correct base URL
// Works both in dev (/) and production (/group-grocer-mate/)
const base = import.meta.env.BASE_URL;

const stripLeadingSlash = (value: string) => value.replace(/^\/+/, '');

export const appBasePath = base;
export const getAppPath = (path = '') => `${base}${stripLeadingSlash(path)}`;
export const getAbsoluteAppUrl = (path = '') =>
  typeof window === 'undefined'
    ? getAppPath(path)
    : new URL(getAppPath(path), window.location.origin).toString();

export const appLogo = getAppPath('app-logo.png');
export const appIcon = getAppPath('app-icon.png');
export const pwaIcon192 = getAppPath('pwa-icon-192.png');
