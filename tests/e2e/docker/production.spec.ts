/* eslint-disable node/no-process-env */
import { Buffer } from 'node:buffer';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, guardedTest as test } from '#e2e/fixtures';
import { request } from '@playwright/test';
import * as Y from 'yjs';

const container = process.env.DOCKER_TEST_CONTAINER!;
const password = 'production-fixture-password-1234';
const email = 'admin@production.example.test';

function docker(...args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8' }).trim();
}

function createAdmin(name: string): void {
  docker('exec', '-e', `DJANGO_SUPERUSER_PASSWORD=${password}`, name,
    'python', 'manage.py', 'createsuperuser', '--noinput', '--email', email);
}

function bundleDigest(): string {
  return docker('exec', container, 'python', '-c',
    "import hashlib; from pathlib import Path; p=Path('/data/secrets.json'); assert p.stat().st_mode & 0o777 == 0o600; print(hashlib.sha256(p.read_bytes()).hexdigest())");
}

test('retained Docker runtime data is private to the invoking user', () => {
  const directory = fs.statSync(path.resolve('data/docker-test-runtime'));
  expect(directory.mode & 0o077).toBe(0);
});

test('production admin, native login, collaboration, and restart use persistent Django data', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const origin = process.env.DOCKER_TEST_ORIGIN!;
  await expect.poll(async () => {
    try { return (await page.request.get('/health')).status(); } catch { return 0; }
  }, { timeout: 30_000 }).toBe(200);
  createAdmin(container);
  const originalBundle = bundleDigest();
  await page.goto('/admin/');
  await page.getByLabel('Email:', { exact: true }).fill(email);
  await page.getByLabel('Password:', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Site administration' })).toBeVisible();
  expect((await page.request.get('/django-static/admin/css/base.css')).status()).toBe(200);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New document', exact: true }).click();
  const editor = page.locator('.editor-input');
  await expect(editor).toBeVisible();
  await expect(page.locator('.collab-status')).toHaveAttribute('aria-label', /Server connected/u);
  await editor.click();
  await page.keyboard.type('Persisted through Django production restart');
  await expect(editor).toContainText('Persisted through Django production restart');
  await expect(page.locator('.collab-status')).toHaveAttribute('aria-label', /Saved to server.*Server connected/u);
  const documentUrl = page.url();
  await page.close();
  docker('restart', '--time', '15', container);
  expect(bundleDigest()).toBe(originalBundle);

  // A fresh browser context cannot satisfy this check from its old IndexedDB.
  const fresh = await browser.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
  try {
    await expect.poll(async () => {
      try { return (await fresh.request.get('/health')).status(); } catch { return 0; }
    }, { timeout: 30_000 }).toBe(200);
    const reopened = await fresh.newPage();
    await reopened.goto(documentUrl);
    await expect(reopened).toHaveURL(/\/accounts\/login\//u);
    const stylesheet = reopened.locator('link[rel="stylesheet"]');
    await expect(stylesheet).toHaveAttribute('href', /^\/app-assets\/shared-.*\.css$/u);
    const styles = await fresh.request.get((await stylesheet.getAttribute('href'))!);
    expect(styles.status()).toBe(200);
    expect(styles.headers()['content-type']).toContain('text/css');
    await expect(reopened.locator('body')).toHaveCSS('margin', '0px');
    await reopened.getByLabel('Email:', { exact: true }).fill(email);
    await reopened.getByLabel('Password:', { exact: true }).fill(password);
    await reopened.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(reopened.locator('.editor-input')).toContainText('Persisted through Django production restart');
    await expect(reopened.locator('.collab-status')).toHaveAttribute('aria-label', /Server connected/u);
    expect((await fresh.request.post('/doc/new')).status()).toBe(404);
    expect((await fresh.request.get('/api/not-a-route')).status()).toBe(404);
  } finally {
    await fresh.close();
  }
});

test('hosted TLS termination preserves secure cookies and trusted-origin CSRF', async () => {
  const hosted = process.env.DOCKER_HOSTED_CONTAINER!;
  const origin = 'https://remdo.onrender.com';
  const api = await request.newContext({
    baseURL: `http://127.0.0.1:${process.env.DOCKER_HOSTED_PORT!}`,
    extraHTTPHeaders: { Host: 'remdo.onrender.com', Origin: origin },
  });
  try {
    await expect.poll(async () => {
      try { return (await api.get('/health')).status(); } catch { return 0; }
    }, { timeout: 30_000 }).toBe(200);
    createAdmin(hosted);
    const configResponse = await api.get('/api/config');
    const config = await configResponse.json() as { csrfToken: string; csrfCookieName: string };
    expect(configResponse.headers()['set-cookie']).toContain('Secure');
    // This probe reaches the internal HTTP hop directly, so supply the secure cookie explicitly.
    const csrfCookie = `${config.csrfCookieName}=${config.csrfToken}`;
    const credentials = { email, password };
    const headers = { Cookie: csrfCookie, 'X-CSRFToken': config.csrfToken };
    const rejected = await api.post('/api/auth/browser/v1/auth/login', {
      headers: { ...headers, Origin: 'https://unrelated.example' }, data: credentials,
    });
    expect(rejected.status()).toBe(403);
    const login = await api.post('/api/auth/browser/v1/auth/login', { headers, data: credentials });
    expect(login.status()).toBe(200);
    const cookies = login.headersArray().filter(header => header.name.toLowerCase() === 'set-cookie');
    const session = cookies.find(header => header.value.startsWith('remdo_session_443='))!;
    expect(session.value).toContain('Secure');
    expect(session.value).toContain('HttpOnly');
    const authenticated = await api.get('/api/current-user', { headers: { Cookie: session.value.split(';')[0]! } });
    expect(authenticated.status()).toBe(200);
  } finally {
    await api.dispose();
  }
});

test('hosted filesystem document content survives restart and container replacement', async () => {
  test.setTimeout(90_000);
  const hosted = process.env.DOCKER_HOSTED_CONTAINER!;
  const origin = 'https://remdo.onrender.com';
  const persistEmail = 'disk-persist@production.example.test';
  const api = await request.newContext({
    baseURL: `http://127.0.0.1:${process.env.DOCKER_HOSTED_PORT!}`,
    extraHTTPHeaders: { Host: 'remdo.onrender.com', Origin: origin },
  });
  try {
    await expect.poll(async () => {
      try { return (await api.get('/health')).status(); } catch { return 0; }
    }, { timeout: 30_000 }).toBe(200);
    docker('exec', '-e', `DJANGO_SUPERUSER_PASSWORD=${password}`, hosted,
      'python', 'manage.py', 'createsuperuser', '--noinput', '--email', persistEmail);
    const configResponse = await api.get('/api/config');
    const config = await configResponse.json() as { csrfToken: string; csrfCookieName: string };
    const login = await api.post('/api/auth/browser/v1/auth/login', {
      headers: { Cookie: `${config.csrfCookieName}=${config.csrfToken}`, 'X-CSRFToken': config.csrfToken },
      data: { email: persistEmail, password },
    });
    expect(login.status()).toBe(200);
    const session = login.headersArray()
      .find(header => header.name.toLowerCase() === 'set-cookie' && header.value.startsWith('remdo_session_443='))!;
    const sessionCookie = session.value.split(';')[0]!;
    const authedConfigResponse = await api.get('/api/config', { headers: { Cookie: sessionCookie } });
    const authedConfig = await authedConfigResponse.json() as { csrfToken: string; csrfCookieName: string };
    const authedHeaders = {
      Cookie: `${sessionCookie}; ${authedConfig.csrfCookieName}=${authedConfig.csrfToken}`,
      'X-CSRFToken': authedConfig.csrfToken,
    };
    const created = await api.post('/api/documents', { headers: authedHeaders, data: { title: 'Disk restart' } });
    expect(created.status()).toBe(201);
    const { id: docId } = await created.json() as { id: string };
    const tokenResponse = await api.post(`/api/documents/${docId}/sync-tokens`, {
      headers: authedHeaders, data: {},
    });
    expect(tokenResponse.status()).toBe(200);
    const clientToken = await tokenResponse.json() as { token: string };
    // Keep privileged readback credentials inside the container.
    function documentUpdate(): string {
      return docker('exec', hosted, 'python', '-c', `
import base64, json, sys, urllib.request
from django.conf import settings
doc_id = sys.argv[1]
def request(url, token, data=None):
    headers = {"Authorization": "Bearer " + token, "Content-Type": "application/json"}
    with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers), timeout=5) as response:
        return response.read()
auth = json.loads(request("http://127.0.0.1:4004/doc/" + doc_id + "/auth", settings.YSWEET_SERVER_TOKEN, b"{}"))
print(base64.b64encode(request(auth["baseUrl"].rstrip("/") + "/as-update", auth["token"])).decode())
`, docId);
    }
    async function writeDocument(doc: Y.Doc): Promise<void> {
      const response = await api.post(`/d/${docId}/update`, {
        headers: { authorization: `Bearer ${clientToken.token}`, 'content-type': 'application/octet-stream' },
        data: Buffer.from(Y.encodeStateAsUpdate(doc)),
      });
      expect(response.status()).toBe(200);
    }
    async function waitForCollaboration(): Promise<void> {
      await expect.poll(async () => {
        try { return (await api.get('/health')).status(); } catch { return 0; }
      }, { timeout: 30_000 }).toBe(200);
      await expect.poll(() => {
        const result = spawnSync('docker', ['exec', hosted, 'python', '-c',
          'import urllib.request; from django.conf import settings; urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:4004/check_store", data=b"{}", headers={"Authorization": "Bearer " + settings.YSWEET_SERVER_TOKEN, "Content-Type": "application/json"}), timeout=1)'],
        { encoding: 'utf8' });
        return result.status;
      }, { timeout: 30_000 }).toBe(0);
    }
    function readDocument(): Y.Doc {
      const doc = new Y.Doc();
      Y.applyUpdate(doc, Buffer.from(documentUpdate(), 'base64'));
      return doc;
    }
    await waitForCollaboration();
    const original = new Y.Doc();
    original.getText('content').insert(0, 'Persisted on disk');
    await writeDocument(original);
    original.destroy();

    docker('restart', '--time', '15', hosted);
    await waitForCollaboration();
    const restored = readDocument();
    expect(restored.getText('content').toString()).toBe('Persisted on disk');
    restored.getText('content').insert(restored.getText('content').length, ' after restart');
    await writeDocument(restored);
    restored.destroy();

    const [instance] = JSON.parse(docker('inspect', hosted)) as Array<{
      Config: { Image: string; Env: string[] };
      Mounts: Array<{ Source: string; Destination: string }>;
    }>;
    docker('stop', '--time', '15', hosted);
    docker('rm', hosted);
    docker('run', '-d', '--userns=host', '--name', hosted, '--network', process.env.PG_NETWORK!,
      '-p', `127.0.0.1:${process.env.DOCKER_HOSTED_PORT!}:8080`,
      ...instance!.Config.Env.flatMap(value => ['-e', value]),
      ...instance!.Mounts.flatMap(mount => ['-v', `${mount.Source}:${mount.Destination}`]),
      instance!.Config.Image);
    await waitForCollaboration();
    const redeployed = readDocument();
    expect(redeployed.getText('content').toString()).toBe('Persisted on disk after restart');
    redeployed.destroy();
    expect(docker('exec', hosted, 'python', '-c', `
from pathlib import Path
import sys
print((Path('/data/collab') / sys.argv[1] / 'data.ysweet').stat().st_size > 0)
`, docId)).toBe('True');
  } finally {
    await api.dispose();
  }
});


test('startup refuses missing or corrupt secrets over an existing dataset', async () => {
  test.setTimeout(45_000);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-secret-recovery-'));
  const saved = path.join(temporary, 'saved.json');
  const corrupt = path.join(temporary, 'corrupt.json');
  docker('cp', `${container}:/data/secrets.json`, saved);
  try {
    docker('exec', container, 'python', '-c', "from pathlib import Path; Path('/data/secrets.json').unlink()");
    docker('restart', '--time', '15', container);
    await expect.poll(() => docker('inspect', '--format', '{{.State.Running}}', container)).toBe('false');
    expect(docker('inspect', '--format', '{{.State.ExitCode}}', container)).not.toBe('0');
    const missingLog = spawnSync('docker', ['logs', container], { encoding: 'utf8' });
    expect(missingLog.stderr).toContain('Missing secrets.json for an existing dataset');

    fs.writeFileSync(corrupt, '{}', { mode: 0o600 });
    docker('cp', corrupt, `${container}:/data/secrets.json`);
    docker('start', container);
    await expect.poll(() => docker('inspect', '--format', '{{.State.Running}}', container)).toBe('false');
    expect(docker('inspect', '--format', '{{.State.ExitCode}}', container)).not.toBe('0');
    const corruptLog = spawnSync('docker', ['logs', container], { encoding: 'utf8' });
    expect(corruptLog.stderr).toContain('restore the complete secret bundle');
    // Startup must not repair the file and silently change account/collaboration secrets.
    const observed = path.join(temporary, 'observed.json');
    docker('cp', `${container}:/data/secrets.json`, observed);
    expect(fs.readFileSync(observed, 'utf8')).toBe('{}');
  } finally {
    docker('cp', saved, `${container}:/data/secrets.json`);
    docker('start', container);
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});


test('a fresh data root cannot regenerate secrets for an existing PostgreSQL database', async ({ request: api }) => {
  await expect.poll(async () => {
    try {
      return (await api.get(`http://127.0.0.1:${process.env.DOCKER_HOSTED_PORT!}/health`, {
        headers: { Host: 'remdo.onrender.com' },
      })).status();
    } catch { return 0; }
  }, { timeout: 30_000 }).toBe(200);
  const image = docker('inspect', '--format', '{{.Config.Image}}', container);
  const result = spawnSync('docker', ['run', '--rm', '--network', process.env.PG_NETWORK!,
    '-e', `DATABASE_URL=${process.env.DOCKER_DATABASE_URL!.replace(/\/remdo$/, '/hosted')}`,
    '-e', 'APP_ORIGIN=https://remdo.localhost', image], { encoding: 'utf8', timeout: 30_000 });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Missing secrets.json for an existing dataset');
});
