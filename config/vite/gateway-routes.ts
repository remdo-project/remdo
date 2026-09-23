const frontendFiles = new Set([
  '/favicon.ico',
  '/logo.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/manifest.webmanifest',
  '/sw.js',
  '/registerSW.js',
]);

export function shouldProxyToDjango(url: string): boolean {
  const pathname = url.split('?')[0]!;
  if (frontendFiles.has(pathname) || pathname.startsWith('/app-assets/') || pathname.startsWith('/icons/')
    || /^\/workbox-[^/]+\.js$/u.test(pathname)) {
    return false;
  }
  if (pathname === '/playground' || pathname.startsWith('/playground/')) {
    return false;
  }
  return !['/@', '/src/', '/node_modules/', '/config/', '/tests/', '/tools/'].some((prefix) => pathname.startsWith(prefix));
}
