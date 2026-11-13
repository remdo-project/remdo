import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TestMantineProvider } from '#tests';
import { NOTES_QUERY_KEY } from '#client/app/user-data/stored-user-data';
import type { WorkspaceEntry } from './use-workspaces';
import { WorkspaceDocumentView } from './WorkspaceDocumentView';

// The outline joins a live room, which these tests of the Markdown view don't run.
vi.mock('#client/editor/shell/WorkspaceOutline', () => ({ default: () => null }));

const README = 'w1/README.md';

afterEach(() => { vi.unstubAllGlobals(); });

// A notes server holding one README whose saves are refused once someone else saved it.
function serveReadme(content: string) {
  const document = { content, version: 'v1', saves: 1, readable: true, responded: Promise.resolve() };
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/config') return Response.json({ csrfCookieName: 'csrftoken' });
    if (request.method === 'GET') {
      if (!document.readable) return new Response(null, { status: 503 });
      return Response.json({
        ref: README, kind: 'document', text: 'README', operations: ['read', 'setContent'],
        version: document.version, content: document.content, contentEncoding: 'utf8',
      });
    }
    const { operations, expected } = await request.json() as {
      operations: Array<{ content: string }>;
      expected: Record<string, string | null>;
    };
    if (expected[README] !== document.version) {
      return Response.json(
        { code: 'FAILED_PRECONDITION', message: 'stale', index: 0, versions: { [README]: document.version } },
        { status: 409 },
      );
    }
    document.content = operations[0]!.content;
    document.version = `v${++document.saves}`;
    const saved = document.version;
    await document.responded;
    return Response.json({
      results: [{ ref: README }],
      changes: [{ ref: README, change: 'changed', version: saved }],
      revision: document.saves,
      dryRun: false,
    });
  }));
  return {
    document,
    saveAsSomeoneElse: (text: string) => {
      document.content = text;
      document.version = `v${++document.saves}`;
    },
  };
}

const workspace: WorkspaceEntry = {
  kind: 'workspace',
  documentRef: README,
  getId: () => 'w1',
  getText: () => 'Trip',
  canRename: () => true,
  canShareWith: () => false,
  canDelete: () => true,
  rename: async () => {},
  delete: async () => {},
};

let client: QueryClient;

async function open() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TestMantineProvider>
        <WorkspaceDocumentView onClose={() => {}} workspace={workspace} />
      </TestMantineProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByText('Markdown', { exact: true }));
  return screen.findByRole<HTMLTextAreaElement>('textbox', { name: 'Trip Markdown' });
}

function save(box: HTMLTextAreaElement, text: string) {
  fireEvent.change(box, { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
}

it('keeps typed text through a stale save and reloads theirs on request', async () => {
  const server = serveReadme('- a\n');
  const box = await open();
  server.saveAsSomeoneElse('- theirs\n');

  save(box, '- mine\n');

  await screen.findByRole('alert', { name: /changed this document/u });
  expect(box).toHaveValue('- mine\n');
  expect(server.document.content).toBe('- theirs\n');
  fireEvent.click(screen.getByRole('button', { name: 'Reload theirs' }));
  await waitFor(() => expect(box).toHaveValue('- theirs\n'));
  expect(screen.queryByRole('alert')).toBeNull();
});

it('overwrites their save with the typed text on request', async () => {
  const server = serveReadme('- a\n');
  const box = await open();
  server.saveAsSomeoneElse('- theirs\n');
  save(box, '- mine\n');

  fireEvent.click(await screen.findByRole('button', { name: 'Overwrite with mine' }));

  await waitFor(() => expect(server.document.content).toBe('- mine\n'));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('status')).toHaveTextContent('Saved');
});

it('keeps typed text when reloading theirs fails', async () => {
  const server = serveReadme('- a\n');
  const box = await open();
  server.saveAsSomeoneElse('- theirs\n');
  save(box, '- mine\n');
  await screen.findByRole('alert', { name: /changed this document/u });

  server.document.readable = false;
  fireEvent.click(screen.getByRole('button', { name: 'Reload theirs' }));

  await screen.findByText('Could not reload');
  expect(box).toHaveValue('- mine\n');
  expect(screen.getByRole('alert', { name: /changed this document/u })).toBeInTheDocument();
});

it('takes over a save made elsewhere when nothing is typed', async () => {
  const server = serveReadme('- a\n');
  const box = await open();
  server.saveAsSomeoneElse('- theirs\n');

  await act(() => client.invalidateQueries({ queryKey: NOTES_QUERY_KEY }));

  await waitFor(() => expect(box).toHaveValue('- theirs\n'));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('status')).toHaveTextContent('Saved');
});

it('offers the conflict choice at once when a save elsewhere meets typed text', async () => {
  const server = serveReadme('- a\n');
  const box = await open();
  fireEvent.change(box, { target: { value: '- mine\n' } });
  server.saveAsSomeoneElse('- theirs\n');

  await act(() => client.invalidateQueries({ queryKey: NOTES_QUERY_KEY }));

  await screen.findByRole('alert', { name: /changed this document/u });
  expect(box).toHaveValue('- mine\n');
});

it('takes over a save made elsewhere that a read reports while its own save is answered', async () => {
  const server = serveReadme('- a\n');
  const box = await open();
  let respond!: () => void;
  server.document.responded = new Promise((resolve) => { respond = resolve; });
  save(box, '- mine\n');
  await waitFor(() => expect(server.document.content).toBe('- mine\n'));

  server.saveAsSomeoneElse('- theirs\n');
  await act(() => client.invalidateQueries({ queryKey: NOTES_QUERY_KEY }));
  respond();

  await waitFor(() => expect(box).toHaveValue('- theirs\n'));
  expect(screen.queryByRole('alert')).toBeNull();
});

it('keeps its own later save after a read reported its earlier one', async () => {
  serveReadme('- a\n');
  const box = await open();
  save(box, '- one\n');
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
  await act(() => client.invalidateQueries({ queryKey: NOTES_QUERY_KEY }));

  save(box, '- two\n');

  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
  expect(box).toHaveValue('- two\n');
});
