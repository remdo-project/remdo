/* eslint-disable node/no-process-env */
import { execFileSync } from 'node:child_process';
import { expect, guardedTest as test } from '#e2e/fixtures';

const container = process.env.DOCKER_TEST_CONTAINER!;
function python(script: string, ...args: string[]) {
  return execFileSync('docker', ['exec', container, 'python', '-c', script, ...args], { encoding: 'utf8' });
}

test('returning browsers revalidate files and retain server navigation responses', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await expect.poll(async () => {
    try { return (await page.request.get('/health')).status(); } catch { return 0; }
  }, { timeout: 30_000 }).toBe(200);
  const email = `cache-${testInfo.testId}@example.test`;
  python("import sys, os; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'remdo.settings'); import django; django.setup(); from accounts.models import User; User.objects.create_superuser(sys.argv[1], 'cache-password-1234')", email);
  await page.goto('/');
  await page.getByLabel('Email:', { exact: true }).fill(email);
  await page.getByLabel('Password:', { exact: true }).fill('cache-password-1234');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.getByRole('button', { name: 'New document', exact: true }).click();
  await expect(page.locator('.editor-input')).toBeVisible();
  const documentUrl = page.url();
  for (const url of [`${documentUrl}?freshness=probe`, `${documentUrl}/?freshness=probe`]) {
    const documentResponse = await page.goto(url);
    expect(documentResponse!.fromServiceWorker()).toBe(true);
    await expect(page.locator('.editor-input')).toBeVisible();
  }

  for (const url of ['/?next=/n/example', '/sharing?freshness=probe', '/sharing/?freshness=probe']) {
    const gatewayResponse = await page.request.get(url);
    expect(gatewayResponse.status(), url).toBe(200);
    expect(await gatewayResponse.text()).toContain('<div id="root">');
    const response = await page.goto(url);
    expect(response!.fromServiceWorker(), url).toBe(true);
    expect(await response!.text()).toContain('<div id="root">');
  }
  await page.goto('/');

  // This page expects HTTP errors; keep the ordinary page's error guards intact.
  const retiredRoutePage = await page.context().newPage();
  try {
    for (const url of ['/oauth/consent?client_id=example', '/oauth/consent/?client_id=example']) {
      const gatewayResponse = await page.request.get(url);
      expect(gatewayResponse.status(), url).toBe(404);
      expect(gatewayResponse.headers()['cache-control'], url).toContain('no-store');
      const response = await retiredRoutePage.goto(url);
      expect(response!.fromServiceWorker(), url).toBe(false);
      expect(response!.status(), url).toBe(404);
      expect(response!.headers()['cache-control'], url).toContain('no-store');
      await expect(retiredRoutePage.locator('body')).toHaveText('Not Found');
    }
  } finally {
    await retiredRoutePage.close();
  }

  for (const url of ['/', '/index.html', '/sw.js', '/manifest.webmanifest', '/logo.svg', '/django-static/admin/css/base.css']) {
    const response = await page.request.get(url);
    expect(response.status(), url).toBe(200);
    expect(response.headers()['cache-control'], url).toBe('no-cache');
  }
  const asset = await page.locator('script[type="module"]').getAttribute('src');
  expect((await page.request.get(asset!)).headers()['cache-control']).toBe('no-cache');
  for (const url of ['/health', '/api/current-user', '/api/schema', '/accounts/login/', '/api/not-a-route', '/d/missing/as-update']) {
    expect((await page.request.get(url)).headers()['cache-control'], url).toContain('no-store');
  }
  const missing = await page.request.get('/app-assets/missing.js');
  expect(missing.status()).toBe(404);
  expect(missing.headers()['cache-control']).toContain('no-store');
  expect(await missing.text()).not.toContain('<html');

  const publish = (content: string, modified: string) => python(
    "import os, sys; from pathlib import Path; p=Path('/data/public-share/freshness.txt.next'); p.write_text(sys.argv[1]); os.utime(p, (int(sys.argv[2]), int(sys.argv[2]))); p.replace(p.with_suffix(''))",
    content, modified,
  );
  publish('first version', '1700000000');
  const first = await page.goto('/share/freshness.txt');
  expect(first!.fromServiceWorker()).toBe(false);
  expect(first!.headers()['cache-control']).toBe('no-cache');
  expect(first!.headers()['content-type']).toContain('text/plain');
  await expect(page.locator('body')).toContainText('first version');
  const etag = first!.headers().etag!;
  const modified = first!.headers()['last-modified']!;
  const unchanged = await page.request.get('/share/freshness.txt', { headers: { 'If-None-Match': etag } });
  expect(unchanged.status()).toBe(304);
  publish('other version', '1700000002'); // Same byte length, changed validators.
  const replacement = await page.request.get('/share/freshness.txt', {
    headers: { 'If-None-Match': etag, 'If-Modified-Since': modified },
  });
  expect(replacement.status()).toBe(200);
  expect(await replacement.text()).toBe('other version');
  const range = await page.request.get('/share/freshness.txt', { headers: { Range: 'bytes=0-4' } });
  expect(range.status()).toBe(206);
  expect(await range.text()).toBe('other');
  await page.goto('/');
  await page.goto('/share/freshness.txt');
  await expect(page.locator('body')).toContainText('other version');
  for (const url of ['/health', '/admin/']) {
    const response = await page.goto(url);
    expect(response!.fromServiceWorker(), url).toBe(false);
    expect(response!.headers()['cache-control'], url).toContain('no-store');
  }
});
