import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getCachedCurrentUserBootstrap } from '#client/app/user-data/current-user-bootstrap';
import { NOTES_QUERY_KEY } from '#client/app/user-data/stored-user-data';
import { callNotes, readNote } from './notes-api';
import type { NoteOperation, NoteRead } from './notes-api';

const ACCOUNT_QUERY = [...NOTES_QUERY_KEY, 'me'] as const;
/** Mirrors WORKSPACE_NAME_MAX_LENGTH in backend/workspaces/models.py. */
export const WORKSPACE_NAME_MAX_LENGTH = 200;

/** A workspace as Home lists it: rows, menus and dialogs treat it like a document. */
export interface WorkspaceEntry {
  readonly kind: 'workspace';
  readonly documentRef: string;
  getId: () => string;
  getText: () => string;
  canRename: () => boolean;
  canShareWith: () => boolean;
  canDelete: () => boolean;
  rename: (name: string) => Promise<void>;
  delete: () => Promise<void>;
}

export function isWorkspaceEntry(entry: object): entry is WorkspaceEntry {
  return 'kind' in entry && entry.kind === 'workspace';
}

async function change(client: QueryClient, operation: NoteOperation) {
  try {
    return await callNotes([operation]);
  } finally {
    await client.invalidateQueries({ queryKey: ACCOUNT_QUERY });
  }
}

function workspaceEntry(client: QueryClient, workspace: NoteRead): WorkspaceEntry {
  const { ref, text, operations } = workspace;
  return {
    kind: 'workspace',
    documentRef: workspace.children![0]!.ref,
    getId: () => ref,
    getText: () => text,
    canRename: () => operations.includes('setText'),
    canShareWith: () => false,
    canDelete: () => operations.includes('delete'),
    rename: async (name) => { await change(client, { op: 'setText', target: ref, text: name }); },
    delete: async () => { await change(client, { op: 'delete', target: ref, withChildren: true }); },
  };
}

/**
 * The account's workspaces, empty for an account without workspace access, which the
 * current-user bootstrap reports. The account's change notice keeps them current.
 */
export function useWorkspaces() {
  const client = useQueryClient();
  // Read each render: the bootstrap that reports access can land after Home mounts.
  const enabled = getCachedCurrentUserBootstrap()?.canUseWorkspaces === true;
  const query = useQuery({
    queryKey: ACCOUNT_QUERY,
    enabled,
    queryFn: ({ signal }) => readNote('me', { depth: 2 }, signal),
  });
  const workspaces = useMemo(
    () => query.data?.children?.map((workspace) => workspaceEntry(client, workspace)) ?? [],
    [client, query.data],
  );
  const create = async (name: string) => {
    const result = await change(client, { op: 'insert', parent: 'me', kind: 'workspace', text: name });
    return String(result.results[0]?.ref);
  };
  return {
    workspaces,
    enabled,
    error: query.error,
    retry: () => { void query.refetch(); },
    create,
  };
}
