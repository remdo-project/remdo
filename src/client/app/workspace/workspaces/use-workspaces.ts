import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { getCachedCurrentUserBootstrap } from '#client/app/user-data/current-user-bootstrap';
import { callNotes, readNote } from './notes-api';

const ACCOUNT_QUERY = ['notes', 'me'] as const;

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

function workspaceEntry(client: QueryClient, ref: string, name: string, documentRef: string): WorkspaceEntry {
  const refresh = () => client.invalidateQueries({ queryKey: ACCOUNT_QUERY });
  return {
    kind: 'workspace',
    documentRef,
    getId: () => ref,
    getText: () => name,
    canRename: () => true,
    canShareWith: () => false,
    canDelete: () => true,
    rename: async (text) => {
      try {
        await callNotes([{ op: 'setText', target: ref, text }]);
      } finally {
        await refresh();
      }
    },
    delete: async () => {
      try {
        await callNotes([{ op: 'delete', target: ref, withChildren: true }]);
      } finally {
        await refresh();
      }
    },
  };
}

/**
 * The account's workspaces, or null for an account without workspace access, which the
 * current-user bootstrap reports.
 * Home reads them again after its own changes and when the window regains focus;
 * the change stream replaces both.
 */
export function useWorkspaces() {
  const client = useQueryClient();
  const enabled = getCachedCurrentUserBootstrap()?.canUseWorkspaces === true;
  const query = useQuery({
    queryKey: ACCOUNT_QUERY,
    enabled,
    refetchOnWindowFocus: true,
    queryFn: ({ signal }) => readNote('me', { depth: 2 }, signal),
  });
  const workspaces = query.data?.children?.map((workspace) => workspaceEntry(
    client,
    workspace.ref,
    workspace.text,
    workspace.children?.[0]?.ref ?? `${workspace.ref}/README.md`,
  ));
  const create = async (name: string) => {
    const result = await callNotes([{ op: 'insert', parent: 'me', kind: 'workspace', text: name }]);
    await client.invalidateQueries({ queryKey: ACCOUNT_QUERY });
    return String(result.results[0]?.ref);
  };
  return {
    workspaces: enabled ? workspaces ?? [] : null,
    enabled,
    error: query.error,
    retry: () => { void query.refetch(); },
    create,
  };
}
