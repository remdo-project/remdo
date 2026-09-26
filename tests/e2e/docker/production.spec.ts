/* eslint-disable node/no-process-env */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, guardedTest as test, setExpectedConsoleIssues } from '#e2e/fixtures';
import type { APIRequestContext } from '@playwright/test';
import { waitForHealth } from './_support/helpers';
import { request } from '@playwright/test';
import * as Y from 'yjs';
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import WebSocket from 'ws';
import { requestPersistence } from '#collaboration/persistence-barrier';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const container = process.env.DOCKER_TEST_CONTAINER!;
const password = 'production-fixture-password-1234';
const email = 'admin@production.example.test';

function docker(...args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8' }).trim();
}

async function openDocument(url: string, docId: string, headers: Record<string, string>) {
  class SessionWebSocket extends WebSocket {
    constructor(address: string | URL) {
      // The Docker harness connects only to local test containers with disposable
      // accounts. Standalone HTTPS uses Caddy's locally issued certificate; these
      // persistence tests do not verify certificate trust.
      super(address, { headers, rejectUnauthorized: false });
    }
  }
  const endpoint = new URL('/collaboration', url);
  endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new HocuspocusProviderWebsocket({
    url: endpoint.href,
    WebSocketPolyfill: SessionWebSocket,
  });
  const document = new Y.Doc();
  const provider = new HocuspocusProvider({ name: docId, document, websocketProvider: socket });
  provider.attach();
  const close = () => { provider.destroy(); socket.destroy(); document.destroy(); };
  try {
    await expect.poll(() => provider.synced, { timeout: 20_000 }).toBe(true);
  } catch (error) {
    close();
    throw error;
  }
  return { document, provider, close };
}

function createAdmin(name: string): void {
  docker('exec', '-e', `DJANGO_SUPERUSER_PASSWORD=${password}`, name,
    'python', 'manage.py', 'createsuperuser', '--noinput', '--email', email);
}

function bundleDigest(): string {
  return docker('exec', container, 'python', '-c',
    "import hashlib; from pathlib import Path; p=Path('/data/secrets.json'); assert p.stat().st_mode & 0o777 == 0o600; print(hashlib.sha256(p.read_bytes()).hexdigest())");
}

// page.route cannot intercept a request the service worker's fetch handler
// answers, and `/api/` is a NetworkOnly runtime-caching route. Once the worker
// claims the page, the build-revision override below is bypassed at random.
test.use({ serviceWorkers: 'block' });

test('retained Docker runtime data is private to the invoking user', () => {
  const directory = fs.statSync(path.resolve('data/docker-test-runtime'));
  expect(directory.mode & 0o077).toBe(0);
});

for (const hosted of [false, true]) {
  test(`${hosted ? 'Render' : 'standalone'} login limits separate clients and ignore forged forwarding headers`, async ({ request: api }) => {
    await waitForHealth(
      api,
      hosted ? `http://127.0.0.1:${process.env.DOCKER_HOSTED_PORT!}/health` : '/health',
      hosted ? { Host: 'remdo.onrender.com' } : undefined,
    );
    const result = docker('exec', hosted ? process.env.DOCKER_HOSTED_CONTAINER! : container, 'python', '-c', `
import http.client, json, os, ssl
from urllib.parse import urlsplit

origin = os.environ['APP_ORIGIN']
url = urlsplit(origin)
hosted = os.environ.get('RENDER') == 'true'
port = int(os.environ['PORT']) if hosted else url.port or 443

def request(method, path, client, forged, body=None, csrf=None,
            content_type='application/json'):
    # Separate socket addresses reach the actual Caddy gateway in standalone mode.
    # Hosted requests emulate the documented, edge-overwritten Cloudflare header.
    kwargs = dict(source_address=(client if not hosted else '127.0.0.1', 0), timeout=5)
    connection = http.client.HTTPConnection('127.0.0.1', port, **kwargs)
    if not hosted:
        connection.connect()
        connection.sock = ssl._create_unverified_context().wrap_socket(
            connection.sock, server_hostname=url.hostname)
    headers = {'Host': url.netloc, 'Origin': origin, 'Content-Type': content_type,
               'X-Forwarded-For': forged, 'X-Real-IP': forged,
               'CF-Connecting-IP': client if hosted else forged}
    if csrf:
        headers.update({'Cookie': csrf['csrfCookieName'] + '=' + csrf['csrfToken'],
                        'X-CSRFToken': csrf['csrfToken']})
    connection.request(method, path, body, headers)
    response = connection.getresponse()
    status, data = response.status, response.read()
    connection.close()
    return status, data

first, second = ('198.51.100.20', '198.51.100.21') if hosted else ('127.0.0.2', '127.0.0.3')
status, body = request('GET', '/api/config', first, '192.0.2.1')
assert status == 200, (status, body)
csrf = json.loads(body)
def login(client, forged):
    # Missing credentials avoid password hashing; the real login endpoint still
    # consumes allauth's default 30/minute IP allowance before input validation.
    return request('POST', '/api/auth/browser/v1/auth/login', client, forged, '{}', csrf)[0]

statuses = [login(first, '192.0.2.' + str(i + 1)) for i in range(30)]
def admin_login(client):
    return request('POST', '/accounts/login/?next=/admin/', client, '192.0.2.100',
                   '', csrf, 'application/x-www-form-urlencoded')[0]

print(json.dumps({'allowed': statuses, 'blocked': login(first, '192.0.2.100'),
                  'other': login(second, '192.0.2.100'),
                  'adminBlocked': admin_login(first), 'adminOther': admin_login(second)}))
`);
    expect(JSON.parse(result)).toEqual({
      allowed: Array.from({ length: 30 }).fill(400), blocked: 429, other: 400,
      adminBlocked: 429, adminOther: 200,
    });
  });
}

test('production launcher serves login, collaboration, and persistent data through its published port', async ({ page, browser }) => {
  test.setTimeout(90_000);
  setExpectedConsoleIssues(page, ['Service Worker registration blocked by Playwright'], { mode: 'allowContains' });
  const origin = process.env.DOCKER_TEST_ORIGIN!;
  await waitForHealth(page.request);
  createAdmin(container);
  const originalBundle = bundleDigest();
  await page.goto('/admin/');
  await page.getByLabel('Email:', { exact: true }).fill(email);
  await page.getByLabel('Password:', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Site administration' })).toBeVisible();
  expect((await page.request.get('/django-static/admin/css/base.css')).status()).toBe(200);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  const revision = process.env.BUILD_REVISION || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const buildLink = page.getByRole('link', { name: `#${revision.slice(0, 8)}`, exact: true });
  await expect(buildLink).toHaveAttribute('href', `https://github.com/remdo-project/remdo/commit/${revision}`);
  const otherRevision = 'abcdef0123456789abcdef0123456789abcdef0123';
  await page.route('**/api/config', async (route) => {
    const response = await route.fetch();
    const configuration = await response.json();
    expect(configuration.buildRevision).toBe(revision);
    await route.fulfill({ response, json: { ...configuration, buildRevision: otherRevision } });
  });
  await page.reload();
  const warning = page.getByRole('status').filter({ hasText: 'App and server builds differ' });
  await expect(warning).toBeVisible();
  await expect(warning.getByRole('link', { name: '#abcdef01', exact: true }))
    .toHaveAttribute('href', `https://github.com/remdo-project/remdo/commit/${otherRevision}`);
  await page.unroute('**/api/config');
  await page.reload();
  await expect(warning).toHaveCount(0);
  await expect(buildLink).toBeVisible();
  await page.getByRole('button', { name: 'New document', exact: true }).click();
  const editor = page.locator('.editor-input');
  await expect(editor).toBeVisible();
  await expect(page.locator('.collab-status')).toHaveAttribute('aria-label', /Server connected/u);
  await editor.click();
  await page.keyboard.type('Persisted through Django production restart');
  await expect(editor).toContainText('Persisted through Django production restart');
  await expect(page.locator('.collab-status')).toHaveAttribute('aria-label', /Saved to server.*Server connected/u);
  const documentUrl = page.url();
  const cookie = (await page.context().cookies()).map(({ name, value }) => `${name}=${value}`).join('; ');
  const saved = await openDocument(origin, new URL(documentUrl).pathname.split('/').at(-1)!, { Origin: origin, Cookie: cookie });
  try {
    await requestPersistence(saved.provider);
  } finally {
    saved.close();
  }
  await page.close();
  docker('restart', '--time', '15', container);
  expect(bundleDigest()).toBe(originalBundle);

  // A fresh browser context cannot satisfy this check from its old IndexedDB.
  const fresh = await browser.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
  try {
    await waitForHealth(fresh.request);
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

test('hosted startup provisions the administrator at the service origin', async () => {
  test.setTimeout(120_000);
  const hosted = process.env.DOCKER_HOSTED_CONTAINER!;
  const origin = 'https://remdo.onrender.com';
  const bootstrapEmail = 'admin@remdo.onrender.com';
  const bootstrapPassword = process.env.DOCKER_TEST_BOOTSTRAP_PASSWORD!;
  const api = await request.newContext({
    baseURL: `http://127.0.0.1:${process.env.DOCKER_HOSTED_PORT!}`,
    extraHTTPHeaders: { Host: 'remdo.onrender.com', Origin: origin, 'CF-Connecting-IP': '198.51.100.10' },
  });

  async function signIn(): Promise<number> {
    const config = await (await api.get('/api/config')).json() as {
      csrfToken: string;
      csrfCookieName: string;
    };
    const response = await api.post('/api/auth/browser/v1/auth/login', {
      headers: {
        Cookie: `${config.csrfCookieName}=${config.csrfToken}`,
        'X-CSRFToken': config.csrfToken,
      },
      data: { email: bootstrapEmail, password: bootstrapPassword },
    });
    return response.status();
  }

  try {
    await waitForHealth(api);
    expect(await signIn()).toBe(200);
    // The password reaches provisioning but must not outlive it in a service.
    // PID 1 and this probe are excluded: /proc reports the environment each was
    // exec'd with, which `unset` in the entrypoint shell does not rewrite.
    expect(docker('exec', hosted, 'sh', '-c',
      // A pipeline would run the loop in a subshell, whose own pid then escapes
      // the exclusion below, so collect first and count afterwards.
      'self=$$; for p in /proc/[0-9]*; do pid=$(basename "$p");'
      + ' [ "$pid" = 1 ] || [ "$pid" = "$self" ] ||'
      + ' tr "\\0" "\\n" < "$p/environ" 2>/dev/null; done > /tmp/environs;'
      + ' grep -c ^REMDO_ADMIN_PASSWORD= /tmp/environs || true')).toBe('0');

    docker('restart', hosted);
    await waitForHealth(api);

    expect(await signIn()).toBe(200);
    expect(docker('exec', hosted, 'python', '-c', `
import django
django.setup()
from accounts.models import User
print(User.objects.filter(email='${bootstrapEmail}', is_superuser=True).count())
`)).toBe('1');
  } finally {
    await api.dispose();
  }
});

test('hosted TLS termination preserves secure cookies and trusted-origin CSRF', async () => {
  const hosted = process.env.DOCKER_HOSTED_CONTAINER!;
  const origin = 'https://remdo.onrender.com';
  const api = await request.newContext({
    baseURL: `http://127.0.0.1:${process.env.DOCKER_HOSTED_PORT!}`,
    extraHTTPHeaders: { Host: 'remdo.onrender.com', Origin: origin, 'CF-Connecting-IP': '198.51.100.10' },
  });
  try {
    await waitForHealth(api);
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

for (const hostedMode of [false, true]) {
test(`${hostedMode ? 'PostgreSQL' : 'SQLite'} document content survives restart and container replacement`, async () => {
  test.setTimeout(120_000);
  const hosted = hostedMode ? process.env.DOCKER_HOSTED_CONTAINER! : container;
  const origin = hostedMode ? 'https://remdo.onrender.com' : process.env.DOCKER_TEST_ORIGIN!;
  const persistEmail = 'database-persist@production.example.test';
  const apiOptions = {
    baseURL: hostedMode ? `http://127.0.0.1:${process.env.DOCKER_HOSTED_PORT!}` : origin,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { Host: new URL(origin).host, Origin: origin, 'CF-Connecting-IP': '198.51.100.10' },
  };
  async function signIn(api: APIRequestContext): Promise<Record<string, string>> {
    const configResponse = await api.get('/api/config');
    const config = await configResponse.json() as { csrfToken: string; csrfCookieName: string };
    const login = await api.post('/api/auth/browser/v1/auth/login', {
      headers: { Cookie: `${config.csrfCookieName}=${config.csrfToken}`, 'X-CSRFToken': config.csrfToken },
      data: { email: persistEmail, password },
    });
    expect(login.status()).toBe(200);
    const session = login.headersArray()
      .find(header => header.name.toLowerCase() === 'set-cookie' && header.value.startsWith('remdo_session_'))!;
    const sessionCookie = session.value.split(';')[0]!;
    const authedConfigResponse = await api.get('/api/config', { headers: { Cookie: sessionCookie } });
    const authedConfig = await authedConfigResponse.json() as { csrfToken: string; csrfCookieName: string };
    return {
      Cookie: `${sessionCookie}; ${authedConfig.csrfCookieName}=${authedConfig.csrfToken}`,
      'X-CSRFToken': authedConfig.csrfToken,
    };
  }
  const api = await request.newContext(apiOptions);
  try {
    await waitForHealth(api);
    docker('exec', '-e', `DJANGO_SUPERUSER_PASSWORD=${password}`, hosted,
      'python', 'manage.py', 'createsuperuser', '--noinput', '--email', persistEmail);
    const authedHeaders = await signIn(api);
    const created = await api.post('/api/documents', { headers: authedHeaders, data: { title: 'Database restart' } });
    expect(created.status()).toBe(201);
    const { id: docId } = await created.json() as { id: string };
    const connect = (headers: Record<string, string>) => openDocument(apiOptions.baseURL, docId, {
      ...apiOptions.extraHTTPHeaders, Cookie: headers.Cookie!,
    });
    const original = await connect(authedHeaders);
    try {
      original.document.getText('content').insert(0, 'Persisted in SQL plus removed suffix');
      await expect.poll(() => original.provider.hasUnsyncedChanges).toBe(false);
      await requestPersistence(original.provider);
      // A deletion-only update has no new Yjs state-vector clock. The explicit
      // save barrier must still commit it before the process exits.
      original.document.getText('content').delete('Persisted in SQL'.length, ' plus removed suffix'.length);
      await expect.poll(() => original.provider.hasUnsyncedChanges).toBe(false);
      await requestPersistence(original.provider);
    } finally {
      original.close();
    }

    docker('restart', '--time', '30', hosted);
    await waitForHealth(api);
    const restored = await connect(await signIn(api));
    try {
      expect(restored.document.getText('content').toString()).toBe('Persisted in SQL');
      restored.document.getText('content').insert(restored.document.getText('content').length, ' after restart');
      await expect.poll(() => restored.provider.hasUnsyncedChanges).toBe(false);
      await requestPersistence(restored.provider);
    } finally {
      restored.close();
    }

    const [instance] = JSON.parse(docker('inspect', hosted)) as Array<{
      Config: { Image: string; Env: string[] };
      HostConfig: { NetworkMode: string; PortBindings: Record<string, Array<{ HostIp: string; HostPort: string }>> };
      Mounts: Array<{ Source: string; Destination: string }>;
    }>;
    docker('stop', '--time', '30', hosted);
    docker('rm', hosted);
    docker('run', '-d', '--userns=host', '--name', hosted, '--network', instance!.HostConfig.NetworkMode,
      ...Object.entries(instance!.HostConfig.PortBindings).flatMap(([port, bindings]) =>
        bindings.flatMap(binding => ['-p', `${binding.HostIp}:${binding.HostPort}:${port}`])),
      ...instance!.Config.Env.flatMap(value => ['-e', value]),
      ...instance!.Mounts.flatMap(mount => ['-v', `${mount.Source}:${mount.Destination}`]),
      instance!.Config.Image);
    const fresh = await request.newContext(apiOptions);
    try {
      await waitForHealth(fresh);
      const freshHeaders = await signIn(fresh);
      const documents = await fresh.get('/api/documents', { headers: freshHeaders });
      expect(documents.status()).toBe(200);
      expect(await documents.json()).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: docId, title: 'Database restart' }),
      ]));
      const redeployed = await connect(freshHeaders);
      try {
        expect(redeployed.document.getText('content').toString()).toBe('Persisted in SQL after restart');
      } finally {
        redeployed.close();
      }
    } finally {
      await fresh.dispose();
    }
    expect(docker('exec', hosted, 'python', '-c', `
import django, sys
django.setup()
from documents.models import DocumentContent
print(len(DocumentContent.objects.get(document_id=sys.argv[1]).state) > 0)
`, docId)).toBe('True');
  } finally {
    await api.dispose();
  }
});
}


test('MCP saves an outline through the gateway with a delegated token', async () => {
  const hosted = process.env.DOCKER_HOSTED_CONTAINER!;
  const base = `http://127.0.0.1:${process.env.DOCKER_HOSTED_PORT!}`;
  // The hosted gateway serves only its public host, which Node fetch cannot send.
  const api = await request.newContext({ baseURL: base, extraHTTPHeaders: { Host: 'remdo.onrender.com' } });
  const gatewayFetch = async (url: string | URL, init?: RequestInit) => {
    const response = await api.fetch(String(url), {
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      data: typeof init?.body === 'string' ? init.body : undefined,
    });
    return new Response(new Uint8Array(await response.body()), { status: response.status(), headers: response.headers() });
  };
  await waitForHealth(api);
  const token = docker('exec', hosted, 'python', 'manage.py', 'shell', '-c', `
import secrets
from datetime import timedelta
from accounts.models import User
from allauth.idp.oidc.models import Token
from django.utils import timezone
user, _ = User.objects.get_or_create(email="mcp@production.example.test")
value = secrets.token_urlsafe(32)
token = Token(type=Token.Type.ACCESS_TOKEN, user=user, expires_at=timezone.now() + timedelta(hours=1))
token.set_value(value)
token.save()
print(value)
`).split('\n').at(-1)!;
  const unauthorized = await gatewayFetch(new URL('/mcp', base), { method: 'POST' });
  expect(unauthorized.status).toBe(401);

  const client = new Client({ name: 'docker-test', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', base), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
    fetch: gatewayFetch,
  }));
  try {
    const call = async (name: string, args: Record<string, unknown>) => {
      const response = await client.callTool({ name, arguments: args });
      expect(response.isError, JSON.stringify(response.content)).not.toBe(true);
      return JSON.parse((response.content as Array<{ text: string }>)[0]!.text) as unknown;
    };
    const { documentId } = await call('create_document', { title: 'From Claude' }) as { documentId: string };
    const [saved] = await call('append_children', { parent: documentId, notes: [{ text: 'Summary' }] }) as Array<{ url: string }>;
    expect(saved!.url).toMatch(new RegExp(`/n/${documentId}_`));
  }
  finally {
    await client.close();
    await api.dispose();
  }
});

test('startup refuses missing or corrupt secrets over an existing dataset', async () => {
  test.setTimeout(45_000);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-secret-recovery-'));
  const saved = path.join(temporary, 'saved.json');
  const corrupt = path.join(temporary, 'corrupt.json');
  docker('cp', `${container}:/data/secrets.json`, saved);
  const restartPolicy = docker('inspect', '--format', '{{.HostConfig.RestartPolicy.Name}}', container);
  // Observe terminal startup failure without the launcher's automatic restarts.
  docker('update', '--restart=no', container);
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
    docker('update', '--restart', restartPolicy, container);
    docker('start', container);
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});


test('a fresh data root cannot regenerate secrets for an existing PostgreSQL database', async ({ request: api }) => {
  await waitForHealth(api, `http://127.0.0.1:${process.env.DOCKER_HOSTED_PORT!}/health`, { Host: 'remdo.onrender.com' });
  const image = docker('inspect', '--format', '{{.Config.Image}}', container);
  const result = spawnSync('docker', ['run', '--rm', '--network', process.env.PG_NETWORK!,
    '-e', `DATABASE_URL=${process.env.DOCKER_DATABASE_URL!.replace(/\/remdo$/, '/hosted')}`,
    '-e', 'APP_ORIGIN=https://remdo.localhost', image], { encoding: 'utf8', timeout: 30_000 });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Missing secrets.json for an existing dataset');
});

test('public collaboration strips privileged credentials instead of granting operator access', async ({ request: api }) => {
  await waitForHealth(api);
  const documentId = docker('exec', container, 'python', '-c', `
import django
from django.conf import settings
from urllib.request import Request, urlopen
from urllib.parse import urlsplit
django.setup()
from accounts.models import User
from documents.models import Document
user = User.objects.create_user('gateway-credential@example.test')
document = Document.objects.get(owner=user)
request = Request('http://127.0.0.1:4011/internal/collaboration/documents/' + document.pk + '/authorize', headers={
    'Host': urlsplit(settings.APP_ORIGIN).netloc,
    'X-Remdo-Collaboration-Secret': settings.COLLAB_INTERNAL_SECRET,
    'X-Remdo-Collaboration-Operator': '1',
})
with urlopen(request) as response:
    assert response.status == 200
print(document.pk)
`);
  // This generated fixture credential stays in the Node process, outside
  // browser traces and request attachments. Never print it in diagnostics.
  const secret = docker('exec', container, 'python', '-c',
    'from django.conf import settings; print(settings.COLLAB_INTERNAL_SECRET)');
  const origin = process.env.DOCKER_TEST_ORIGIN!;
  class PrivilegedWebSocket extends WebSocket {
    constructor(address: string | URL) {
      super(address, {
        // This local Docker fixture uses Caddy's locally issued certificate and
        // a disposable service credential. The assertion checks gateway credential
        // stripping, not certificate trust.
        rejectUnauthorized: false,
        headers: {
          Origin: origin,
          'X-Remdo-Collaboration-Secret': secret,
          'X-Remdo-Collaboration-Operator': '1',
        },
      });
    }
  }
  const socket = new HocuspocusProviderWebsocket({
    url: `${origin.replace('https:', 'wss:')}/collaboration`,
    WebSocketPolyfill: PrivilegedWebSocket,
  });
  const document = new Y.Doc();
  let resolveOutcome!: (value: string) => void;
  const outcome = new Promise<string>(resolve => { resolveOutcome = resolve; });
  const provider = new HocuspocusProvider({
    name: documentId,
    document,
    websocketProvider: socket,
    onAuthenticationFailed: ({ reason }) => resolveOutcome(reason),
    onSynced: ({ state }) => { if (state) resolveOutcome('unexpected operator access'); },
  });
  try {
    provider.attach();
    expect(await outcome).toBe('permission-denied');
    expect(provider.synced).toBe(false);
  } finally {
    provider.destroy();
    socket.destroy();
    document.destroy();
  }
});
