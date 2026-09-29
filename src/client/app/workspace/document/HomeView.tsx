import type { ChangeEvent } from 'react';
import { useEffect, useRef } from 'react';
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
}: {
  label: string;
  documents: readonly HomeDocumentEntry[];
  onSelectDocument: (docId: string) => void;
  onDelete: (note: DocumentNote, trigger: HTMLButtonElement | null) => void;
  onRename: (note: DocumentNote, trigger: HTMLButtonElement | null) => void;
  onShare: (note: DocumentNote, trigger: HTMLButtonElement | null) => void;
  resolveDocument: (docId: string) => DocumentNote | null;
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
            <li className="home-doc-row" key={document.id}>
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
  const { documentDialog, openDelete, openRename, openShare } = useDocumentDialogs(headingRef);

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
    <section aria-label="Home" className="document-home" data-testid="document-home">
      <div className="document-home-heading">
        <h1 className="document-home-title" ref={headingRef} tabIndex={-1}>Home</h1>
        <div className="home-actions">
          <button
            className="home-action home-action--secondary"
            onClick={() => uploadInputRef.current?.click()}
            type="button"
          >
            Upload document
          </button>
          <button className="home-action home-action--primary" onClick={onCreateDocument} type="button">
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
          />
        ))}

      {documentDialog}
    </section>
  );
}
