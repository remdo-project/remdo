import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import type { Browser } from 'playwright';
import type { components } from '#platform/http/api-schema';
import { resetDemoAccount } from '../lib/demo-account';
import { provisionDjangoUser } from '../lib/django-user';
import { createFixtureDocument } from '../lib/fixture-document';
import { readFixtureState } from '../lib/fixtures';
import { CodexTerminal, requireDocumentRead, requireSuccessfulTools, resultText } from './codex';
import type { ToolCall } from './codex';
import { Pane } from './pane';
import type { OutlineNote, Timing } from './pane';
import type { Scene } from './scenario';
import { confirmStoredOutline, mcpToken, signIn } from './session';

type Document = components['schemas']['Document'];
interface ReviewCase { prompt: string; tools_triggered?: string }
const ACCOUNT = { email: 'openai-review@example.test', password: 'openai-review-password-1234', name: 'Plugin review' };
const PRIVATE_OWNER = { email: 'openai-private@example.test', password: 'openai-private-password-1234', name: 'Private fixture owner' };
const PRIVATE_OUTLINE: OutlineNote[] = [{ text: 'note1' }, { text: 'note2' }, { text: 'note3' }];
const OUTLINE: OutlineNote[] = [{ text: 'Plan', children: [{ text: 'Scope' }, { text: 'Schedule' }] }];
const CHECKLIST: OutlineNote[] = [{ text: 'Tasks', children: [{ text: 'First task' }, { text: 'Second task' }] }];
const SUBTREE: OutlineNote[] = [
  { text: 'Plan', children: [{ text: 'Scope', children: [{ text: 'Detail' }] }] },
  { text: 'Other topic' },
];

function expectTools(calls: ToolCall[], test: ReviewCase): void {
  const used = new Set(calls.map(({ tool }) => tool));
  for (const tool of test.tools_triggered!.split(',').map((name) => name.trim())) {
    if (!used.has(tool)) throw new Error(`Review case did not use ${tool}. Used: ${[...used].join(', ')}`);
  }
}

export async function prepare(browser: Browser, timing: Timing, origin: string): Promise<Scene> {
  const manifest = JSON.parse(await readFile(new URL('../../plugins/openai/plugin.json', import.meta.url), 'utf8'));
  const { positive, negative } = manifest.extensions['com.openai'].review.test_cases as {
    positive: ReviewCase[]; negative: ReviewCase[];
  };
  const privateDocumentId = negative[2]!.prompt.match(/document '([^']+)'/)![1]!;
  await provisionDjangoUser(PRIVATE_OWNER);
  await resetDemoAccount(origin, PRIVATE_OWNER, { emptyDocument: false });
  await createFixtureDocument({
    email: PRIVATE_OWNER.email, id: privateDocumentId, title: 'Private access fixture',
  }, await readFixtureState('flat'));
  const privateContext = await signIn(browser, origin, PRIVATE_OWNER);
  const privateUrl = new URL(`/n/${privateDocumentId}`, origin).href;
  await confirmStoredOutline(browser, privateContext, privateUrl, PRIVATE_OUTLINE);
  await provisionDjangoUser(ACCOUNT);
  await resetDemoAccount(origin, ACCOUNT, { emptyDocument: 'Plugin walkthrough' });
  const context = await signIn(browser, origin, ACCOUNT);
  const main = new Pane(await context.newPage(), timing, origin);
  const terminalPane = new Pane(await context.newPage(), timing, origin);
  const terminal = await CodexTerminal.open(terminalPane, {
    url: new URL('/mcp', origin).href, token: await mcpToken(ACCOUNT.email), account: ACCOUNT.name,
  });
  await main.openHome();

  async function inventory(): Promise<Document[]> {
    return (await (await context.request.get(new URL('/api/documents', origin).href, { failOnStatusCode: true })).json()) as Document[];
  }

  async function open(title: string, expected?: OutlineNote[]): Promise<void> {
    await main.openHome();
    await main.open(title);
    await main.page.reload();
    if (expected) {
      await confirmStoredOutline(browser, context, main.page.url(), expected);
      await terminal.annotate('Saved outline verified in a fresh RemDo session.');
    }
    await main.pause('long');
  }

  async function positiveCase(index: number, title?: string, expected?: OutlineNote[]): Promise<ToolCall[]> {
    const test = positive[index]!;
    const { calls } = await terminal.ask(test.prompt);
    requireSuccessfulTools(calls);
    expectTools(calls, test);
    if (title) await open(title, expected);
    await main.page.waitForTimeout(timing.of('readReply'));
    return calls;
  }

  return {
    main,
    panes: { main, codex: terminalPane },
    play: async ({ chapter, closingCard, split, unsplit, pause }) => {
      await chapter('RemDo · OpenAI plugin', 'Five positive cases and three safe fallbacks, live in Codex CLI');
      await split(terminalPane);
      await chapter('Review connection', 'A dedicated RemDo account · authorization prepared before recording');
      await pause('long');

      await chapter('1 · List documents', 'See the documents the connected account can access');
      const initial = await inventory();
      const listed = await positiveCase(0);
      const listedDocuments = JSON.parse(resultText(listed.find(({ tool }) => tool === 'list_documents')!)) as { documentId: string }[];
      if (!isDeepStrictEqual(listedDocuments.map(({ documentId }) => documentId).sort(), initial.map(({ id }) => id).sort())) {
        throw new Error('The listed documents differ from the connected account\'s inventory.');
      }

      await chapter('2 · Create an outline', 'Create, append a hierarchy, and read the saved result');
      const outlined = await positiveCase(1, 'RemDo review outline', OUTLINE);
      const ownedDocumentId = (JSON.parse(resultText(outlined.find(({ tool }) => tool === 'create_document')!)) as { documentId: string }).documentId;
      requireDocumentRead(outlined, ownedDocumentId);

      await chapter('3 · Rename a document', 'The title changes; the document ID and URL stay the same');
      const renamed = await positiveCase(2, 'RemDo review renamed');
      const createdDocument = JSON.parse(resultText(renamed.find(({ tool }) => tool === 'create_document')!)) as { documentId: string; url: string };
      const renamedDocument = JSON.parse(resultText(renamed.find(({ tool }) => tool === 'rename_document')!)) as { documentId: string; url: string };
      if (createdDocument.documentId !== renamedDocument.documentId || createdDocument.url !== renamedDocument.url) {
        throw new Error('Renaming changed the document ID or URL.');
      }
      await terminal.annotate('Rename verified: the document ID and URL are unchanged.');
      await pause('long');

      await chapter('4 · Make a checklist', 'Convert only the child list and preserve its notes');
      await positiveCase(3, 'RemDo review checklist', CHECKLIST);
      const checked = await main.page.locator('li[role="checkbox"]').evaluateAll((notes) => notes.map((note) => note.getAttribute('aria-checked')));
      if (!isDeepStrictEqual(checked, ['false', 'false'])) throw new Error('The new checklist is not two unchecked children.');
      await terminal.annotate('Both checklist children are saved and unchecked.');
      await pause('long');

      await chapter('5 · Read a subtree', 'Return Plan and Scope; report the hidden child');
      const subtree = await positiveCase(4, 'RemDo review subtree', SUBTREE);
      const read = subtree.filter(({ tool }) => tool === 'read_document').at(-1)!;
      if (read.arguments.depth !== 2 || typeof read.arguments.target !== 'string' || !read.arguments.target.includes('_')) {
        throw new Error('The final read did not address a note subtree at depth 2.');
      }
      const text = resultText(read);
      if (!text.includes('Scope') || !text.includes('(1 child not shown)') || text.includes('Detail') || text.includes('Other topic')) {
        throw new Error('The depth-limited subtree read included the wrong notes.');
      }
      await terminal.annotate('Depth 2 read verified: Plan and Scope; Scope has one hidden child.');
      await main.goTo('Plan');
      await main.zoomIn();
      await pause('long');

      const beforeNegative = await inventory();
      const titles = [
        ['6 · Unsupported deletion', 'Explain the capability limit without changing any notes'],
        ['7 · Unrelated question', 'Answer without accessing RemDo'],
        ['8 · Read another document by ID', 'Same account and request; only the document ID changes'],
      ] as const;
      for (const [index, [title, description]] of titles.entries()) {
        if (index === 2) {
          await chapter('Access check · Read an owned document by ID', 'Repeat the successful read as the control');
          await open('RemDo review outline', OUTLINE);
          const { calls } = await terminal.ask(negative[2]!.prompt.replace(privateDocumentId, ownedDocumentId));
          requireSuccessfulTools(calls);
          if (calls.some(({ tool }) => tool !== 'list_documents' && tool !== 'read_document')) {
            throw new Error('The owned-document access check attempted a write.');
          }
          const read = requireDocumentRead(calls, ownedDocumentId);
          if (!['Plan', 'Scope', 'Schedule'].every((note) => resultText(read).includes(note))) {
            throw new Error('The owned-document read did not return the saved outline.');
          }
          await terminal.annotate('Owned document read by ID: saved outline returned.');
          await pause(6);
        }
        await chapter(title, description);
        const { calls } = await terminal.ask(negative[index]!.prompt);
        if (index === 1 && calls.length !== 0) throw new Error('The unrelated question accessed RemDo.');
        if (calls.some(({ tool }) => tool !== 'list_documents' && tool !== 'read_document')) {
          throw new Error(`Negative case ${index + 1} attempted to change documents.`);
        }
        if (!isDeepStrictEqual(await inventory(), beforeNegative)) throw new Error('A negative case changed the document inventory.');
        if (index === 2) {
          requireDocumentRead(calls, privateDocumentId, 'access-denied');
          await terminal.annotate('Existing unshared document: RemDo denied access; no documents changed.');
        } else {
          await terminal.annotate(calls.length === 0 ? 'No RemDo tools were called; no documents changed.' : 'Only read-only RemDo activity; no documents changed.');
        }
        await pause(6);
      }
      await unsplit();
      await main.openHome();
      await pause('long');
      await closingCard('Connected, useful, scoped', 'RemDo · live OpenAI plugin review walkthrough');
    },
    verify: async () => {
      await open('RemDo review outline', OUTLINE);
      await open('RemDo review checklist', CHECKLIST);
      await open('RemDo review subtree', SUBTREE);
      await confirmStoredOutline(browser, privateContext, privateUrl, PRIVATE_OUTLINE);
      const documents = await inventory();
      const expected = ['Plugin walkthrough', 'RemDo review outline', 'RemDo review renamed', 'RemDo review checklist', 'RemDo review subtree'];
      if (!isDeepStrictEqual(documents.map(({ title }) => title).sort(), expected.sort())) {
        throw new Error('The review run created or changed unexpected documents.');
      }
    },
    close: async () => {
      await terminal.close();
      await privateContext.close();
    },
  };
}
