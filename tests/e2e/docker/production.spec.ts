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

test('hosted S3 document content survives restart and container replacement', async () => {
  test.setTimeout(90_000);
  const hosted = process.env.DOCKER_HOSTED_CONTAINER!;
  const docId = 's3Persistence';
  // Use the private control API without exposing it or copying credentials out of the container.
  function documentRequest(operation: 'create' | 'read' | 'write', update = ''): string {
    return docker('exec', hosted, 'python', '-c', `
import base64, json, sys, urllib.request
from django.conf import settings
operation, doc_id, update = sys.argv[1:]
def request(url, token, data=None):
    headers = {"Authorization": "Bearer " + token, "Content-Type": "application/octet-stream" if url.endswith('/update') else "application/json"}
    with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers), timeout=5) as response:
        return response.read()
root = "http://127.0.0.1:4004"
if operation == "create":
    request(root + "/doc/new", settings.YSWEET_SERVER_TOKEN, json.dumps({"docId": doc_id}).encode())
else:
    auth = json.loads(request(root + "/doc/" + doc_id + "/auth", settings.YSWEET_SERVER_TOKEN, b"{}"))
    url = auth["baseUrl"].rstrip("/")
    if operation == "write":
        request(url + "/update", auth["token"], base64.b64decode(update))
    else:
        print(base64.b64encode(request(url + "/as-update", auth["token"])).decode())
`, operation, docId, update);
  }
  async function waitForCollaboration(): Promise<void> {
    await expect.poll(() => {
      const result = spawnSync('docker', ['exec', hosted, 'python', '-c',
        'import urllib.request; from django.conf import settings; urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:4004/check_store", data=b"{}", headers={"Authorization": "Bearer " + settings.YSWEET_SERVER_TOKEN, "Content-Type": "application/json"}), timeout=1)'],
      { encoding: 'utf8' });
      return result.status;
    }, { timeout: 30_000 }).toBe(0);
  }
  function readDocument(): Y.Doc {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, Buffer.from(documentRequest('read'), 'base64'));
    return doc;
  }
  await waitForCollaboration();
  documentRequest('create');
  const original = new Y.Doc();
  original.getText('content').insert(0, 'Persisted in S3');
  documentRequest('write', Buffer.from(Y.encodeStateAsUpdate(original)).toString('base64'));
  original.destroy();

  docker('restart', '--time', '15', hosted);
  await waitForCollaboration();
  const restored = readDocument();
  expect(restored.getText('content').toString()).toBe('Persisted in S3');
  restored.getText('content').insert(15, ' after restart');
  documentRequest('write', Buffer.from(Y.encodeStateAsUpdate(restored)).toString('base64'));
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
  expect(redeployed.getText('content').toString()).toBe('Persisted in S3 after restart');
  redeployed.destroy();
  // Recovery must come from the configured object prefix, never a local fallback.
  expect(docker('exec', hosted, 'python', '-c', `
from pathlib import Path
import urllib.request
assert not list(Path('/data/collab').iterdir())
with urllib.request.urlopen('http://s3:9090/remdo/hosted/${docId}/data.ysweet') as response:
    print(len(response.read()) > 0)
`)).toBe('True');
});


test('unavailable S3 storage fails startup instead of falling back to local storage', () => {
  test.setTimeout(45_000);
  const hosted = process.env.DOCKER_HOSTED_CONTAINER!;
  const name = `${hosted}-missing-bucket`;
  const image = docker('inspect', '--format', '{{.Config.Image}}', hosted);
  try {
    const result = spawnSync('docker', ['run', '--name', name, '--network', process.env.PG_NETWORK!,
      '-e', 'APP_ORIGIN=https://remdo.example.test', '-e', 'Y_SWEET_STORE=s3://missing-bucket/instance',
      '-e', 'AWS_ACCESS_KEY_ID=fixture', '-e', 'AWS_SECRET_ACCESS_KEY=fixture',
      '-e', 'AWS_ENDPOINT_URL_S3=http://s3:9090', '-e', 'AWS_S3_USE_PATH_STYLE=true', image],
    { encoding: 'utf8', timeout: 30_000 });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Bucket does not exist');
  } finally {
    docker('rm', '-f', name);
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
