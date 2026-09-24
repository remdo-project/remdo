import { QueryClient, queryOptions } from '@tanstack/react-query';
import { createUserDataRootNote } from '#note-sdk';
import type { CollectionSource, UserDocument } from '#note-sdk';
import type { DocumentAccessView } from '#domain/documents/access';
import { DOCUMENT_TITLE_MAX_LENGTH } from '#domain/documents/user-data';
import { api, requireData } from '#platform/http/api-client';
import { currentUserBootstrapQuery } from './current-user-bootstrap';

export function createUserDataRuntime(userId: string, client = new QueryClient()) {
  const lifetime = new AbortController();
  const bootstrapQuery = currentUserBootstrapQuery(userId);
  const documentsQuery = queryOptions({
    queryKey: [globalThis.location.origin, userId, 'documents'],
    queryFn: async ({ signal }): Promise<UserDocument[]> => {
      signal.throwIfAborted();
      return requireData(await api.GET('/api/documents', { signal }));
    },
  });
  const documents: CollectionSource<UserDocument> = {
    getChildren: () => client.getQueryData(documentsQuery.queryKey) ?? [],
    getById: (id) => documents.getChildren().find((document) => document.id === id) ?? null,
  };
  const createDocumentOptions = {
    mutationKey: [globalThis.location.origin, userId, 'create-document'],
    // Document creation has no durable offline-intent contract. Report a failed
    // request immediately instead of queuing a creation for reconnect.
    networkMode: 'always' as const,
    mutationFn: async (title: string): Promise<UserDocument> => {
      lifetime.signal.throwIfAborted();
      const created = requireData(await api.POST('/api/documents', { body: { title }, signal: lifetime.signal }));
      lifetime.signal.throwIfAborted();
      return created;
    },
    onSuccess: async (created: UserDocument) => {
      // An earlier listing cannot overwrite this successful creation. A later
      // refresh failure leaves the committed result available to the caller.
      await client.cancelQueries({ queryKey: documentsQuery.queryKey });
      lifetime.signal.throwIfAborted();
      client.setQueryData(documentsQuery.queryKey, (items = []) => [
        ...items.filter((document) => document.id !== created.id), created,
      ]);
      void client.invalidateQueries({ queryKey: documentsQuery.queryKey });
    },
  };
  const renameDocumentOptions = {
    mutationKey: [globalThis.location.origin, userId, 'rename-document'],
    // A rename is an explicit submission with a retryable dialog, so a failed
    // request is reported instead of queued for reconnect.
    networkMode: 'always' as const,
    mutationFn: async ({ documentId, title }: { documentId: string; title: string }): Promise<UserDocument> => {
      lifetime.signal.throwIfAborted();
      const result = await api.PUT('/api/documents/{document_id}', {
        params: { path: { document_id: documentId } }, body: { title }, signal: lifetime.signal,
      });
      lifetime.signal.throwIfAborted();
      if (result.response.status === 404) {
        throw new Error('This document is no longer available.');
      }
      if (result.response.status === 400) {
        // A rejected name is corrected in the dialog, so name the limit the
        // caller can act on rather than inviting an identical retry.
        throw new Error(title.length > DOCUMENT_TITLE_MAX_LENGTH
          ? `Use a shorter name, up to ${DOCUMENT_TITLE_MAX_LENGTH} characters.`
          : 'That name was rejected. Try a different one.');
      }
      if (!result.response.ok) {
        throw new Error('Could not rename the document. Please retry.');
      }
      const renamed = requireData(result);
      // The rename response carries only identity and name; the listing owns
      // the document's access and sharing state.
      return { ...documents.getById(renamed.id), ...renamed };
    },
    onSuccess: async (renamed: UserDocument) => {
      await client.cancelQueries({ queryKey: documentsQuery.queryKey });
      lifetime.signal.throwIfAborted();
      client.setQueryData(documentsQuery.queryKey, (items = []) => items.map((document) => (
        document.id === renamed.id ? { ...document, title: renamed.title } : document
      )));
      void client.invalidateQueries({ queryKey: documentsQuery.queryKey });
    },
  };
  const deleteDocumentOptions = {
    mutationKey: [globalThis.location.origin, userId, 'delete-document'],
    networkMode: 'always' as const,
    mutationFn: async (documentId: string): Promise<void> => {
      lifetime.signal.throwIfAborted();
      const result = await api.DELETE('/api/documents/{document_id}', {
        params: { path: { document_id: documentId } }, signal: lifetime.signal,
      });
      lifetime.signal.throwIfAborted();
      // A document that is already gone satisfies the request.
      if (result.response.ok || result.response.status === 404) return;
      throw new Error('Could not delete the document. Please retry.');
    },
    onSuccess: async (_: void, deletedId: string) => {
      await client.cancelQueries({ queryKey: documentsQuery.queryKey });
      lifetime.signal.throwIfAborted();
      client.setQueryData(documentsQuery.queryKey, (items = []) => items.filter((document) => document.id !== deletedId));
      void client.invalidateQueries({ queryKey: documentsQuery.queryKey });
    },
  };
  const shareDocumentOptions = {
    mutationKey: [globalThis.location.origin, userId, 'share-document'],
    networkMode: 'always' as const,
    mutationFn: async ({ documentId, email }: { documentId: string; email: string }): Promise<DocumentAccessView> => {
      lifetime.signal.throwIfAborted();
      const result = await api.POST('/api/documents/{document_id}/access', {
        params: { path: { document_id: documentId } }, body: { email }, signal: lifetime.signal,
      });
      lifetime.signal.throwIfAborted();
      if (result.response.status === 400) {
        throw new Error('Use the email of another account on this server.');
      }
      return requireData(result);
    },
    onSuccess: async (access: DocumentAccessView) => {
      await client.cancelQueries({ queryKey: documentsQuery.queryKey });
      lifetime.signal.throwIfAborted();
      client.setQueryData(documentsQuery.queryKey, (items = []) => items.map((document) => (
        document.id === access.documentId
          ? { ...document, access: [...(document.access ?? []).filter((grant) => grant.granteeUserId !== access.granteeUserId), access] }
          : document
      )));
      void client.invalidateQueries({ queryKey: documentsQuery.queryKey });
    },
  };
  const userData = createUserDataRootNote(documents, {
    shareDocument: (documentId, email) => client.getMutationCache().build(client, shareDocumentOptions).execute({ documentId, email }),
    createDocument: (title) => client.getMutationCache().build(client, createDocumentOptions).execute(title),
    renameDocument: (documentId, title) => client.getMutationCache().build(client, renameDocumentOptions).execute({ documentId, title }),
    deleteDocument: (documentId) => client.getMutationCache().build(client, deleteDocumentOptions).execute(documentId),
  });

  return {
    userId,
    client,
    bootstrapQuery,
    documentsQuery,
    userData,
    dispose: () => {
      // QueryClient cancels reads. Mutations have a separate lifetime because
      // TanStack Query intentionally does not cancel server-side mutations.
      lifetime.abort();
      client.clear();
    },
  };
}

export type UserDataRuntime = ReturnType<typeof createUserDataRuntime>;
let activeRuntime: UserDataRuntime | null = null;

export function getUserDataRuntime(userId: string): UserDataRuntime {
  if (activeRuntime?.userId !== userId) {
    resetUserDataRuntime();
    activeRuntime = createUserDataRuntime(userId);
  }
  return activeRuntime;
}

export function resetUserDataRuntime(): void {
  activeRuntime?.dispose();
  activeRuntime = null;
}
