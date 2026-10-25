import { Buffer } from 'node:buffer';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import type { NewNote } from '#note-sdk';
import { AuthorizationError } from '#platform/net/authorization-error';
import { createDocumentSlots } from './document-slots';
import { appendChildren, readDocumentOutline, setChildListType } from './editor-operations';
import { describeFailure, OperationError } from './operation-error';

const id = z.string().regex(/^[A-Z0-9]{1,20}$/i);
const listType = z.enum(['bullet', 'number', 'check']);
const newNote: z.ZodType<NewNote> = z.lazy(() => z.object({
  text: z.string(), checked: z.boolean().optional(), childListType: listType.optional(),
  children: z.array(newNote).optional(),
}));
const base = { documentId: id, noteId: id.nullable().optional() };
const operationSchema = z.discriminatedUnion('operation', [
  z.object({ ...base, operation: z.literal('read'), depth: z.number().int().min(1).nullable().optional() }),
  z.object({ ...base, operation: z.literal('append'), notes: z.array(newNote) }),
  z.object({ documentId: id, noteId: id, operation: z.literal('setChildListType'), listType }),
]);

function needsReconnection(error: unknown): boolean {
  return error instanceof AuthorizationError || (error instanceof Error && needsReconnection(error.cause));
}

/** Authenticated by the host before reading a body; bearer authorization is repeated by the hub. */
export function createEditorHandler(appOrigin: string, slots: number) {
  const withSlot = createDocumentSlots(slots);
  return async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) {
          response.writeHead(413).end();
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      let body: unknown;
      try { body = JSON.parse(Buffer.concat(chunks).toString()); }
      catch { throw new OperationError('INVALID_ARGUMENT', 'Invalid editor request.'); }
      const parsed = operationSchema.safeParse(body);
      if (!parsed.success) throw new OperationError('INVALID_ARGUMENT', 'Invalid editor request.');
      const args = parsed.data;
      const authorization = request.headers.authorization!;
      const result = await withSlot(async (signal) => {
        switch (args.operation) {
          case 'read': return readDocumentOutline(args.documentId, authorization,
            noteId => `${appOrigin}/n/${args.documentId}_${noteId}`, { ...args, depth: args.depth ?? undefined, signal });
          case 'append': return appendChildren(args.documentId, authorization, args.notes, { noteId: args.noteId, signal });
          case 'setChildListType':
            await setChildListType(args.documentId, authorization, args.noteId, args.listType, { signal });
            return null;
        }
      });
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ result }));
    } catch (error) {
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
        error: { ...describeFailure(error), reconnect: needsReconnection(error) },
      }));
    }
  };
}
