import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { NewNote } from '#note-sdk';
import { requestDjango } from '#platform/net/django-request';
import { withHeadlessOpenDocument } from '../headless/open-document';

const DJANGO_REQUEST_TIMEOUT_MS = 10_000;

interface ServerOptions {
  port: number;
  apiOrigin: string;
  appOrigin: string;
}

const newNote: z.ZodType<NewNote> = z.lazy(() => z.object({
  text: z.string().describe('Plain single-line note text.'),
  checked: z.boolean().optional(),
  childListType: z.enum(['bullet', 'number', 'check']).optional()
    .describe('List type of the children; defaults to the list containing this note.'),
  children: z.array(newNote).optional(),
}));

async function respond(run: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await run()) }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The operation failed.';
    return { isError: true, content: [{ type: 'text', text: message }] };
  }
}

export function createMcpServer({ port, apiOrigin, appOrigin }: ServerOptions) {
  const host = new URL(appOrigin).host;
  const resourceMetadata = new URL('/.well-known/oauth-protected-resource/mcp', appOrigin).href;
  const documentUrl = (documentId: string, noteId?: string) =>
    new URL(`/n/${noteId ? `${documentId}_${noteId}` : documentId}`, appOrigin).href;

  async function callApi(authorization: string, path: string, method = 'GET', body?: unknown) {
    const response = await requestDjango(new URL(path, apiOrigin), {
      method,
      headers: {
        Authorization: authorization,
        Host: host,
        'X-Forwarded-Proto': new URL(appOrigin).protocol.slice(0, -1),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : Buffer.from(JSON.stringify(body)),
      signal: AbortSignal.timeout(DJANGO_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`RemDo rejected the request (${response.status}).`);
    return JSON.parse(response.body.toString()) as unknown;
  }

  function createTools(authorization: string) {
    const server = new McpServer({ name: 'remdo', version: '1' });

    server.registerTool('list_documents', {
      description: 'List the RemDo documents the user can access.',
    }, () => respond(async () => {
      const documents = await callApi(authorization, '/api/documents') as Array<{ id: string; title: string }>;
      return documents.map(({ id, title }) => ({ documentId: id, title, url: documentUrl(id) }));
    }));

    server.registerTool('create_document', {
      description: 'Create a RemDo document.',
      inputSchema: { title: z.string() },
    }, ({ title }) => respond(async () => {
      const { id } = await callApi(authorization, '/api/documents', 'POST', { title }) as { id: string };
      return { documentId: id, title, url: documentUrl(id) };
    }));

    server.registerTool('append_children', {
      description: 'Append notes as the last children of a note (by noteAddress) '
        + 'or as the last top-level notes of a document (by documentId).',
      inputSchema: { parent: z.string().describe('A documentId or a noteAddress.'), notes: z.array(newNote) },
    }, ({ parent, notes }) => respond(async () => {
      const [documentId, noteId] = parent.split('_') as [string, string | undefined];
      const noteIds = await withHeadlessOpenDocument(documentId, authorization, (openDocument) =>
        (noteId ? openDocument.noteRef(noteId) : openDocument.root).appendChildren(notes));
      return noteIds.map((id) => ({ noteAddress: `${documentId}_${id}`, url: documentUrl(documentId, id) }));
    }));

    return server;
  }

  function challenge(response: ServerResponse, invalid: boolean) {
    const error = invalid ? ', error="invalid_token"' : '';
    response.writeHead(401, { 'WWW-Authenticate': `Bearer resource_metadata="${resourceMetadata}"${error}` }).end();
  }

  async function handleMcp(request: IncomingMessage, response: ServerResponse) {
    const authorization = request.headers.authorization;
    if (!authorization || !/^bearer \S/iu.test(authorization)) {
      challenge(response, false);
      return;
    }
    try {
      await callApi(authorization, '/api/current-user');
    } catch {
      challenge(response, true);
      return;
    }
    const server = createTools(authorization);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    response.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(request, response);
  }

  const http = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (path === '/ready' && request.method === 'GET') {
      response.writeHead(200).end();
    } else if (path === '/mcp') {
      handleMcp(request, response).catch(() => {
        if (!response.headersSent) response.writeHead(500).end();
      });
    } else {
      response.writeHead(404).end();
    }
  });

  return {
    listen: () => new Promise<void>((resolve) => http.listen(port, '127.0.0.1', resolve)),
    address: () => http.address(),
    stop: () => new Promise<void>((resolve, reject) => http.close((error) => error ? reject(error) : resolve())),
  };
}
