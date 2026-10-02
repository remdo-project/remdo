import type { ChangeEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { DocumentNote } from '#note-sdk';
import { formatNavigationLabel } from '#client/ui/navigation-label';
import { DocumentMenu } from './DocumentMenu';
import { useDocumentDialogs } from './useDocumentDialogs';
import type { HomeDocumentEntry, HomeDocumentSource } from './home-content';

export interface HomeViewProps {
  sources: readonly HomeDocumentSource[];
  onSelectDocument: (docId: string) => void;
  onCreateDocument: () => void;
  onUploadDocument: (file: File) => void;
  resolveDocument: (docId: string) => DocumentNote | null;
}

function DocumentGroup({
  label,
  documents,
  onSelectDocument,
  onDelete,
  onRename,
  onShare,
  resolveDocument,
  menuTargetId,
  onMenuTarget,
}: {
  label: string;
  documents: readonly HomeDocumentEntry[];
  onSelectDocument: (docId: string) => void;
  onDelete: (note: DocumentNote, trigger: HTMLButtonElement | null) => void;
  onRename: (note: DocumentNote, trigger: HTMLButtonElement | null) => void;
  onShare: (note: DocumentNote, trigger: HTMLButtonElement | null) => void;
  resolveDocument: (docId: string) => DocumentNote | null;
  menuTargetId: string | null;
  onMenuTarget: (docId: string) => void;
}) {
  return (
    <section aria-label={label} className="home-group" role="group">
      <h2 className="home-group-label">{label}</h2>
      <ul className="home-doc-list">
        {documents.map((document) => {
          const note = resolveDocument(document.id);
          const label = formatNavigationLabel(document.label);
          const shared = note !== null && !note.canShareWith();
          const sharedId = `home-doc-shared-${document.id}`;
          return (
            <li
              className="home-doc-row"
              data-menu-target={document.id === menuTargetId ? true : undefined}
              key={document.id}
              onFocus={() => onMenuTarget(document.id)}
              onKeyDownCapture={() => onMenuTarget(document.id)}
              onPointerMove={(event) => {
                if (event.pointerType !== 'touch') onMenuTarget(document.id);
              }}
            >
              {note && (
                <DocumentMenu label={label} note={note} onDelete={onDelete} onRename={onRename} onShare={onShare} />
              )}
              <button
                aria-describedby={shared ? sharedId : undefined}
                className="home-doc remdo-interaction-surface"
                data-home-document-ref={document.id}
                onClick={() => onSelectDocument(document.id)}
                type="button"
              >
                <span className="home-doc-label">{label}</span>
                {shared && <span aria-hidden="true" className="home-doc-shared">Shared</span>}
              </button>
              {shared && <span hidden id={sharedId}>Shared with you</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function HomeView({
  onCreateDocument,
  onSelectDocument,
  onUploadDocument,
  resolveDocument,
  sources,
}: HomeViewProps) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const homeRef = useRef<HTMLElement | null>(null);
  const { documentDialog, openDelete, openRename, openShare } = useDocumentDialogs(headingRef);
  const menuDocumentIds = sources.flatMap((source) => source.documents)
    .filter((document) => {
      const note = resolveDocument(document.id);
      return note && (note.canRename() || note.canShareWith() || note.canDelete());
    })
    .map((document) => document.id);
  const [menuTarget, setMenuTarget] = useState<string | null>(null);
  const menuTargetId = menuTarget !== null && menuDocumentIds.includes(menuTarget)
    ? menuTarget
    : menuDocumentIds[0] ?? null;
  if (menuTarget !== menuTargetId) setMenuTarget(menuTargetId);

  const targetDocument = (docId: string) => {
    if (documentDialog || homeRef.current?.querySelector('.document-menu-button[aria-expanded="true"]')) return;
    if (menuDocumentIds.includes(docId)) setMenuTarget(docId);
  };

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const handleUploadInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = '';
    if (file) {
      onUploadDocument(file);
    }
  };

  return (
    <section aria-label="Home" className="document-home" data-testid="document-home" ref={homeRef}>
      <div className="home-header">
        <h1 className="document-home-title" ref={headingRef} tabIndex={-1}>Home</h1>
        <div className="home-actions">
          <button
            className="remdo-account-button"
            onClick={() => uploadInputRef.current?.click()}
            type="button"
          >
            Upload document
          </button>
          <button
            className="remdo-account-button remdo-account-button-primary"
            onClick={onCreateDocument}
            type="button"
          >
            New document
          </button>
          <input
            accept="application/json,.json"
            aria-label="Upload document"
            className="home-upload-input"
            onChange={handleUploadInputChange}
            ref={uploadInputRef}
            type="file"
          />
        </div>
      </div>

      {sources
        .filter((source) => source.documents.length > 0)
        .map((source) => (
          <DocumentGroup
            documents={source.documents}
            key={source.id}
            label={source.label}
            onDelete={openDelete}
            onRename={openRename}
            onSelectDocument={onSelectDocument}
            onShare={openShare}
            resolveDocument={resolveDocument}
            menuTargetId={menuTargetId}
            onMenuTarget={targetDocument}
          />
        ))}

      {documentDialog}
    </section>
  );
}
