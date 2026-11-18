import { Alert, Button, Group, SegmentedControl, Stack, Textarea } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ZoomBreadcrumbs } from '#client/editor/view/workspace';
import WorkspaceOutline from '#client/editor/shell/WorkspaceOutline';
import { APP_TITLE, formatNavigationLabel } from '#client/ui/navigation-label';
import { DocumentMenu } from '../document/DocumentMenu';
import { useDocumentDialogs } from '../document/useDocumentDialogs';
import { NOTES_QUERY_KEY } from '#client/app/user-data/stored-user-data';
import { callNotes, NotesRefusal, readNote } from './notes-api';
import type { NoteRead } from './notes-api';
import type { WorkspaceEntry } from './use-workspaces';

type Status = 'loading' | 'saved' | 'unsaved' | 'saving';

interface Base {
  text: string;
  version: string | null;
}

const STATUS_LABELS: Record<Status, string> = {
  loading: 'Loading…',
  saved: 'Saved',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
};

const baseOf = (note: NoteRead): Base => ({ text: note.content ?? '', version: note.version ?? null });

function DocumentShell({
  children,
  onClose,
  onSave,
  saveEnabled,
  status,
  workspace,
}: {
  children: ReactNode;
  onClose: () => void;
  onSave: () => void;
  saveEnabled: boolean;
  status: Status;
  workspace: WorkspaceEntry;
}) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const { documentDialog, openDelete, openRename, openShare } = useDocumentDialogs(headingRef, onClose);
  const name = workspace.getText();

  useEffect(() => {
    document.title = `${formatNavigationLabel(name)} · ${APP_TITLE}`;
    return () => { document.title = APP_TITLE; };
  }, [name]);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="document-editor-shell" data-menu-target="header">
      <header className="document-header">
        <div className="document-header-breadcrumbs">
          <ZoomBreadcrumbs docLabel={name} onSelectHome={onClose} onSelectNoteId={() => {}} path={[]} />
        </div>
        <div className="document-header-actions">
          <span className="workspace-document-status" role="status">{STATUS_LABELS[status]}</span>
          <Button disabled={!saveEnabled} onClick={onSave} size="xs">Save</Button>
        </div>
      </header>
      <div className="location-header">
        <div className="location-header-heading">
          <DocumentMenu label={name} note={workspace} onDelete={openDelete} onRename={openRename} onShare={openShare} />
          <h1 className="location-header-title" ref={headingRef} tabIndex={-1}>
            {formatNavigationLabel(name, Number.POSITIVE_INFINITY)}
          </h1>
        </div>
      </div>
      <Stack className="workspace-document" gap="sm">
        {children}
      </Stack>
      {documentDialog}
    </div>
  );
}

function LoadedDocument({
  latest,
  onClose,
  onSaved,
  reload,
  workspace,
}: {
  latest: Base;
  onClose: () => void;
  onSaved: (saved: Base) => Promise<void>;
  reload: () => Promise<NoteRead>;
  workspace: WorkspaceEntry;
}) {
  const ref = workspace.documentRef;
  const [base, setBase] = useState(latest);
  const [draft, setDraft] = useState(latest.text);
  const [saving, setSaving] = useState(false);
  // The current version a stale save was refused against, which may be null for a missing file.
  const [conflict, setConflict] = useState<{ version: string | null } | null>(null);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  // The latest read already taken over or offered as a conflict, so it is handled once.
  const [decided, setDecided] = useState(latest.version);
  const [view, setView] = useState<'outline' | 'markdown'>('outline');

  const adopt = (next: Base) => {
    setBase(next);
    setDraft(next.text);
    setConflict(null);
    setDecided(next.version);
  };

  // A read during this view's own save may predate or follow its response; once the save
  // settles the base version and the latest read, a read that still differs is someone else's save.
  if (!saving && latest.version !== base.version && latest.version !== decided) {
    if (draft === base.text) {
      adopt(latest);
    } else {
      setDecided(latest.version);
      setConflict({ version: latest.version });
    }
  }

  let status: Status = 'saved';
  if (saving) status = 'saving';
  else if (draft !== base.text) status = 'unsaved';
  const saveEnabled = status === 'unsaved' && conflict === null;

  const save = async (version: string | null) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await callNotes([{ op: 'setContent', target: ref, content: draft }], { [ref]: version });
      const saved = { text: draft, version: result.changes.find((change) => change.ref === ref)?.version ?? version };
      await onSaved(saved);
      setBase(saved);
      setConflict(null);
    } catch (failure) {
      if (failure instanceof NotesRefusal && failure.code === 'FAILED_PRECONDITION') {
        setConflict({ version: failure.versions[ref] ?? null });
      } else {
        setError({ title: 'Could not save', message: failure instanceof Error ? failure.message : '' });
      }
    } finally {
      setSaving(false);
    }
  };

  const reloadTheirs = async () => {
    let current: NoteRead;
    try {
      current = await reload();
    } catch (failure) {
      setError({ title: 'Could not reload', message: failure instanceof Error ? failure.message : '' });
      return;
    }
    adopt(baseOf(current));
  };

  return (
    <DocumentShell
      onClose={onClose}
      onSave={() => { void save(base.version); }}
      saveEnabled={saveEnabled}
      status={status}
      workspace={workspace}
    >
      {conflict !== null && (
        <Alert color="red" role="alert" title="Someone changed this document after you opened it" variant="light">
          <Stack align="flex-start" gap="xs">
            Your text isn't saved.
            <Group gap={8}>
              <Button onClick={() => { void reloadTheirs(); }} variant="default">Reload theirs</Button>
              <Button className="remdo-dialog-danger" onClick={() => { void save(conflict.version); }}>
                Overwrite with mine
              </Button>
            </Group>
          </Stack>
        </Alert>
      )}
      {error && (
        <Alert closeButtonLabel="Dismiss" color="red" onClose={() => setError(null)} title={error.title} withCloseButton>
          {error.message}
        </Alert>
      )}
      <SegmentedControl
        aria-label="Document view"
        data={[{ label: 'Outline', value: 'outline' }, { label: 'Markdown', value: 'markdown' }]}
        onChange={setView}
        size="xs"
        value={view}
      />
      {view === 'outline' ? (
        <>
          <p className="workspace-document-note">Read-only for now; switch to Markdown to edit.</p>
          <WorkspaceOutline workspaceId={workspace.getId()} />
        </>
      ) : (
        <>
          <p className="workspace-document-note">Markdown as written.</p>
          <Textarea
            aria-label={`${workspace.getText()} Markdown`}
            className="workspace-document-text"
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
                event.preventDefault();
                if (saveEnabled) void save(base.version);
              }
            }}
            resize="vertical"
            rows={18}
            spellCheck={false}
            value={draft}
          />
        </>
      )}
    </DocumentShell>
  );
}

// TODO: Temporary until the outline is editable (docs/text-format-plan.md, stage 3): a workspace's
// document opens as a read-only outline, edited as Markdown in a plain text box. Probe: open a
// workspace from Home; editing the outline replaces the Markdown view.
export function WorkspaceDocumentView({
  workspace,
  onClose,
}: {
  workspace: WorkspaceEntry;
  onClose: () => void;
}) {
  const ref = workspace.documentRef;
  const client = useQueryClient();
  const queryKey = [...NOTES_QUERY_KEY, ref, 'content'];
  const readme = useQuery({
    queryKey,
    // The loaded view keeps its own base, so a reopened view must read fresh content, not a cached read.
    gcTime: 0,
    queryFn: ({ signal }) => readNote(ref, { content: true, depth: 0 }, signal),
  });
  if (readme.data) {
    return (
      <LoadedDocument
        key={ref}
        latest={baseOf(readme.data)}
        onClose={onClose}
        onSaved={async (saved) => {
          // A read in flight may predate the save, or a read it superseded may still be the
          // latest, so the save becomes the latest read until one started after it lands.
          await client.cancelQueries({ queryKey });
          client.setQueryData<NoteRead>(queryKey, (note) => note && { ...note, content: saved.text, version: saved.version });
          void client.invalidateQueries({ queryKey });
        }}
        reload={async () => (await readme.refetch({ throwOnError: true })).data!}
        workspace={workspace}
      />
    );
  }
  return (
    <DocumentShell onClose={onClose} onSave={() => {}} saveEnabled={false} status="loading" workspace={workspace}>
      {readme.error && (
        <Alert color="red" title="Could not load the document">
          <Button onClick={() => { void readme.refetch(); }}>Retry</Button>
        </Alert>
      )}
    </DocumentShell>
  );
}
