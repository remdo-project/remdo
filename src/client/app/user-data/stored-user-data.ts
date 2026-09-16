import { QueryClient, queryOptions } from '@tanstack/react-query';
import { createUserDataRootNote } from '#note-sdk';
import type { CollectionSource, UserDocument } from '#note-sdk';
import { api, requireData } from '#platform/http/api-client';
import { currentUserBootstrapQuery } from './current-user-bootstrap';

export function createUserDataRuntime(userId: string, client = new QueryClient()) {
  const lifetime = new AbortController();
  const bootstrapQuery = currentUserBootstrapQuery(userId);
  const documentsQuery = queryOptions({
    queryKey: [globalThis.location.origin, userId, 'documents'],
    queryFn: async ({ signal }): Promise<UserDocument[]> => {
      // Bootstrap ensures the account's home document exists before listing.
      await client.query(bootstrapQuery);
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
  const userData = createUserDataRootNote(documents, {
    getHomeDocumentId: () => client.getQueryData(bootstrapQuery.queryKey)?.homeDocumentId ?? null,
    createDocument: (title) => client.getMutationCache().build(client, createDocumentOptions).execute(title),
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
