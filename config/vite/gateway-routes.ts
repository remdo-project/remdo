import { DEV_LEXICAL_DEMO_ROUTE } from '../../src/client/app/shell/dev-route.ts';

const frontendFiles = new Set([
  '/index.html',
  '/favicon.ico',
  '/favicon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.webmanifest',
  '/sw.js',
  '/registerSW.js',
]);

export function shouldProxyToDjango(url: string, mode: 'development' | 'preview'): boolean {
  const pathname = url.split('?')[0]!;
  if (pathname === '/' || pathname === '/sharing' || pathname === '/sharing/' || pathname.startsWith('/n/')) {
    return false;
  }
  if (frontendFiles.has(pathname) || pathname.startsWith('/app-assets/') || pathname.startsWith('/icons/')
    || /^\/workbox-[^/]+\.js$/u.test(pathname)) {
    return false;
  }
  if (mode === 'development') {
    if (pathname === DEV_LEXICAL_DEMO_ROUTE || pathname === '/playground' || pathname.startsWith('/playground/')) {
      return false;
    }
    if (['/@', '/src/', '/node_modules/', '/config/', '/tests/', '/tools/'].some((prefix) => pathname.startsWith(prefix))) {
      return false;
    }
  }
  return true;
}
