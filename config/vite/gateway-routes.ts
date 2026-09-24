const frontendFiles = new Set([
  '/logo.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
]);

export function shouldProxyToDjango(url: string): boolean {
  const pathname = url.split('?')[0]!;
  if (frontendFiles.has(pathname) || pathname.startsWith('/icons/')
    || pathname === '/playground' || pathname.startsWith('/playground/')) {
    return false;
  }
  return !['/@', '/src/', '/node_modules/', '/config/', '/tests/', '/tools/'].some((prefix) => pathname.startsWith(prefix));
}
