import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { NewNote, NoteListType } from '#note-sdk';
import { DJANGO_REQUEST_TIMEOUT_MS, isBearer, requestDjango } from '#platform/net/django-request';
import { parseDocumentRef } from '#document-routes';
import { withHeadlessOpenDocument } from '../headless/open-document';
import { renderOutline } from './outline';
import { createDocumentSlots } from './document-slots';

interface ServerOptions {
  /** The loopback origin this server listens on. */
  origin: string;
  apiOrigin: string;
  appOrigin: string;
  /** Documents that tool calls may hold open at once. */
  documentSlots: number;
}

const listTypeSchema: z.ZodType<NoteListType> = z.enum(['bullet', 'number', 'check']);

const newNote: z.ZodType<NewNote> = z.lazy(() => z.object({
  text: z.string().describe('Plain single-line note text.'),
  checked: z.boolean().optional(),
  childListType: listTypeSchema.optional()
    .describe('List type of the children; defaults to the list containing this note.'),
  children: z.array(newNote).optional(),
}));

const INSTRUCTIONS = [
  'RemDo is an outliner: each document is a tree of single-line notes.',
  'Save content as an outline, not prose: a few short topic titles at the top level, with supporting details nested '
    + 'under the note they support, so each parent summarizes its children and the outline reads well when folded.',
  'Give each topic or conversation its own descriptively titled document, and read a document before adding to it '
    + 'or relying on it.',
].join(' ');

const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_APPENDED_NOTES = 1000;

const UNAVAILABLE = 'RemDo is unavailable. Try again later.';
const UNCONFIRMED = 'RemDo did not confirm whether the request took effect. '
  + 'Check with list_documents before retrying.';

const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } satisfies ToolAnnotations;
const additiveWrite = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } satisfies ToolAnnotations;
const idempotentOverwrite = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } satisfies ToolAnnotations;

const oauthSecuritySchemes = [{ type: 'oauth2', scopes: ['openid'] }];

// The Claude connector directory reads annotations.title; newer clients read the tool's own title.
// MCP SDK 1.x exposes extension metadata through _meta; ChatGPT reads securitySchemes there for compatibility.
function titled(title: string, annotations: ToolAnnotations) {
  return {
    title,
    annotations: { ...annotations, title },
    _meta: { securitySchemes: oauthSecuritySchemes },
  };
}

function countNotes(notes: readonly NewNote[]): number {
  return notes.reduce((count, note) => count + 1 + countNotes(note.children ?? []), 0);
}

function isJson(body: string): boolean {
  try {
    JSON.parse(body);
    return true;
  } catch {
    return false;
  }
}

function rejection(status: number, body: string): string {
  if (status >= 500) return UNAVAILABLE;
  switch (status) {
    case 400: return isJson(body) ? `RemDo rejected the request as invalid: ${body}` : 'RemDo rejected the request as invalid.';
    case 401: return 'RemDo no longer accepts this authorization. Reconnect RemDo.';
    case 403: return 'The user is not allowed to do this in RemDo.';
    default: return `RemDo could not complete the request (${status}).`;
  }
}

async function respond(run: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const result = await run();
    return { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The operation failed.';
    return { isError: true, content: [{ type: 'text', text: message }] };
  }
}

export function createMcpServer({ origin, apiOrigin, appOrigin, documentSlots }: ServerOptions) {
  const withDocumentSlot = createDocumentSlots(documentSlots);
  const { host, protocol } = new URL(appOrigin);
  const resourceMetadata = new URL('/.well-known/oauth-protected-resource/mcp', appOrigin).href;
  const documentUrl = (documentId: string, noteId?: string) =>
    new URL(`/n/${noteId ? `${documentId}_${noteId}` : documentId}`, appOrigin).href;

  async function callApi(authorization: string, path: string, method = 'GET', body?: unknown) {
    const response = await requestDjango(new URL(path, apiOrigin), {
      method,
      headers: {
        Authorization: authorization,
        Host: host,
        'X-Forwarded-Proto': protocol.slice(0, -1),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : Buffer.from(JSON.stringify(body)),
      signal: AbortSignal.timeout(DJANGO_REQUEST_TIMEOUT_MS),
    }).catch((error: unknown) => {
      // Once Django has a write, a timeout or dropped connection leaves its outcome unknown.
      const unconfirmed = method !== 'GET' && (error as NodeJS.ErrnoException).code !== 'ECONNREFUSED';
      throw new Error(unconfirmed ? UNCONFIRMED : UNAVAILABLE);
    });
    if (!response.ok) throw new Error(rejection(response.status, response.body.toString()));
    return JSON.parse(response.body.toString()) as unknown;
  }

  function createTools(authorization: string) {
    const server = new McpServer({
      name: 'remdo',
      title: 'RemDo',
      version: '1',
      websiteUrl: appOrigin,
      icons: [
        { src: new URL('/icon-192.png', appOrigin).href, mimeType: 'image/png', sizes: ['192x192'] },
        { src: new URL('/logo.svg', appOrigin).href, mimeType: 'image/svg+xml', sizes: ['any'] },
      ],
    }, { instructions: INSTRUCTIONS });

    server.registerTool('list_documents', {
      ...titled('List documents', readOnly),
      description: 'List the RemDo documents the user can access, with their documentIds and URLs.',
    }, () => respond(async () => {
      const documents = await callApi(authorization, '/api/documents') as Array<{ id: string; title: string }>;
      return documents.map(({ id, title }) => ({ documentId: id, title, url: documentUrl(id) }));
    }));

    server.registerTool('create_document', {
      ...titled('Create document', additiveWrite),
      description: 'Create a RemDo document owned by the user and return its documentId.',
      inputSchema: { title: z.string().describe('Document title.') },
    }, ({ title }) => respond(async () => {
      const { id } = await callApi(authorization, '/api/documents', 'POST', { title }) as { id: string };
      return { documentId: id, title, url: documentUrl(id) };
    }));

    server.registerTool('rename_document', {
      ...titled('Rename document', idempotentOverwrite),
      description: 'Change the title of a RemDo document.',
      inputSchema: {
        documentId: z.string().describe('A documentId.'),
        title: z.string().describe('The new document title.'),
      },
    }, ({ documentId: input, title }) => respond(async () => {
      const ref = parseDocumentRef(input);
      if (!ref || ref.noteId) throw new Error('The documentId is not valid.');
      const documentId = ref.docId;
      const renamed = await callApi(authorization, `/api/documents/${documentId}`, 'PUT', { title }) as { id: string; title: string };
      return { documentId: renamed.id, title: renamed.title, url: documentUrl(renamed.id) };
    }));

    server.registerTool('read_document', {
      ...titled('Read document', readOnly),
      description: 'Read a RemDo document, or one note and its descendants, as a nested Markdown list. '
        + 'Each note links to its URL, whose last path segment is the noteAddress; a note without a link '
        + 'cannot be addressed until the document is opened in RemDo. A note\'s body follows it as an '
        + 'indented blockquote.',
      inputSchema: {
        target: z.string().describe('A documentId to read the whole document, or a noteAddress to read that note and its descendants.'),
        depth: z.number().int().min(1).optional().describe(
          'How many levels to return, counting the top-level notes (or the addressed note) as level 1. '
          + 'A note on the last level reports how many children it hides. Defaults to every level.',
        ),
      },
    }, ({ target, depth }) => respond(async () => {
      const ref = parseDocumentRef(target);
      if (!ref) throw new Error('The target is not a documentId or a noteAddress.');
      const { docId: documentId, noteId } = ref;
      const outline = await withDocumentSlot(() => withHeadlessOpenDocument(documentId, authorization, async (openDocument, isStored) =>
        renderOutline(
          noteId ? [openDocument.noteRef(noteId)] : openDocument.root.getChildren(),
          (id) => isStored(id) ? documentUrl(documentId, id) : null,
          { depth },
        ),
      { readOnly: true }));
      return `Document: ${documentUrl(documentId)}\n\n${outline}`;
    }));

    server.registerTool('append_children', {
      ...titled('Append notes', additiveWrite),
      description: 'Append notes as the last children of a note (by noteAddress) '
        + 'or as the last top-level notes of a document (by documentId). Write an outline: short topic titles '
        + 'at the top level, supporting details nested beneath.',
      inputSchema: {
        parent: z.string().describe('A documentId or a noteAddress.'),
        notes: z.array(newNote).describe(`At most ${MAX_APPENDED_NOTES} notes, counting nested children.`),
      },
    }, ({ parent, notes }) => respond(async () => {
      if (countNotes(notes) > MAX_APPENDED_NOTES) {
        throw new Error(`Append at most ${MAX_APPENDED_NOTES} notes per call, counting nested children; `
          + 'split the outline across calls.');
      }
      const ref = parseDocumentRef(parent);
      if (!ref) throw new Error('The parent is not a documentId or a noteAddress.');
      const { docId: documentId, noteId } = ref;
      const noteIds = await withDocumentSlot(() => withHeadlessOpenDocument(documentId, authorization, (openDocument) =>
        (noteId ? openDocument.noteRef(noteId) : openDocument.root).appendChildren(notes)));
      return noteIds.map((id) => ({ noteAddress: `${documentId}_${id}`, url: documentUrl(documentId, id) }));
    }));

    server.registerTool('set_child_list_type', {
      ...titled('Set list type', idempotentOverwrite),
      description: 'Convert the list holding a note\'s children to bullet, number, or check. '
        + 'Nested lists keep their own types. A note without children is refused.',
      inputSchema: {
        noteAddress: z.string().describe('A noteAddress.'),
        listType: listTypeSchema.describe('The list type of the note\'s children.'),
      },
    }, ({ noteAddress, listType }) => respond(async () => {
      const ref = parseDocumentRef(noteAddress);
      if (!ref?.noteId) throw new Error('The noteAddress is not valid.');
      const { docId: documentId, noteId } = ref;
      await withDocumentSlot(() => withHeadlessOpenDocument(documentId, authorization, (openDocument) =>
        openDocument.noteRef(noteId).setChildListType(listType)));
      return { noteAddress, listType, url: documentUrl(documentId, noteId) };
    }));

    return server;
  }

  function challenge(response: ServerResponse, invalid: boolean) {
    const error = invalid ? ', error="invalid_token"' : '';
    response.writeHead(401, { 'WWW-Authenticate': `Bearer resource_metadata="${resourceMetadata}"${error}` }).end();
  }

  async function handleMcp(request: IncomingMessage, response: ServerResponse) {
    const authorization = request.headers.authorization;
    if (!authorization || !isBearer(authorization)) {
      challenge(response, false);
      return;
    }
    const check = await requestDjango(new URL('/api/mcp/current-user', apiOrigin), {
      headers: { Authorization: authorization, Host: host },
      signal: AbortSignal.timeout(DJANGO_REQUEST_TIMEOUT_MS),
    }).catch(() => null);
    if (check?.status === 401) {
      challenge(response, true);
      return;
    }
    if (!check?.ok) {
      response.writeHead(503).end();
      return;
    }
    const server = createTools(authorization);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, maxRequestBodySize: MAX_REQUEST_BYTES });
    response.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(request, response);
  }

  const http = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (path === '/mcp') {
      handleMcp(request, response).catch(() => {
        if (!response.headersSent) response.writeHead(500).end();
      });
    } else {
      response.writeHead(404).end();
    }
  });

  return {
    listen: () => new Promise<void>((resolve, reject) => {
      const { hostname, port } = new URL(origin);
      http.once('error', reject);
      http.listen(Number(port), hostname, () => {
        http.off('error', reject);
        resolve();
      });
    }),
    stop: () => new Promise<void>((resolve, reject) => http.close((error) => error ? reject(error) : resolve())),
  };
}
