import { IconPlus, IconUpload } from '@tabler/icons-react';
import type { ChangeEvent } from 'react';
import { useEffect, useRef } from 'react';
import type { DocumentNote } from '#note-sdk';
import { formatNavigationLabel } from '#client/ui/navigation-label';
import { DocumentMenu } from './DocumentMenu';
import { useDocumentRename } from './useDocumentRename';
import type { HomeContent, HomeDocumentEntry } from './home-content';

export interface HomeViewProps extends HomeContent {
  onSelectDocument: (docId: string) => void;
  onCreateDocument: () => void;
  onUploadDocument: (file: File) => void;
  resolveDocument: (docId: string) => DocumentNote | null;
}

function DocumentGroup({
  label,
  documents,
  onSelectDocument,
  onRename,
  resolveDocument,
}: {
  label: string;
  documents: readonly HomeDocumentEntry[];
  onSelectDocument: (docId: string) => void;
  onRename: (note: DocumentNote, trigger: HTMLButtonElement | null) => void;
  resolveDocument: (docId: string) => DocumentNote | null;
}) {
  return (
    <section aria-label={label} className="home-group" role="group">
      <h2 className="home-group-label">{label}</h2>
      <ul className="home-doc-list">
        {documents.map((document) => {
          const note = resolveDocument(document.id);
          return (
            <li className="home-doc-row" key={document.id}>
              {note && <DocumentMenu note={note} onRename={onRename} />}
              <button
                className="home-doc remdo-interaction-surface"
                data-home-document-ref={document.id}
                onClick={() => onSelectDocument(document.id)}
                type="button"
              >
                {formatNavigationLabel(document.label)}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function HomeView({
  favorites,
  onCreateDocument,
  onSelectDocument,
  onUploadDocument,
  recents,
  resolveDocument,
  sources,
  tags,
}: HomeViewProps) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const { openRename, renameDialog } = useDocumentRename(headingRef);

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

  // Entry-point groups first, then the document sources; each renders the same
  // way and is omitted when empty.
  const groups: Array<{ key: string; label: string; documents: readonly HomeDocumentEntry[] }> = [
    { key: 'Favorites', label: 'Favorites', documents: favorites },
    { key: 'Tags', label: 'Tags', documents: tags },
    { key: 'Recents', label: 'Recents', documents: recents },
    ...sources.map((source) => ({ key: source.id, label: source.label, documents: source.documents })),
  ];

  return (
    <section aria-label="Home" className="document-home" data-testid="document-home">
      <h1 className="document-home-title" ref={headingRef} tabIndex={-1}>Home</h1>

      {groups
        .filter((group) => group.documents.length > 0)
        .map((group) => (
          <DocumentGroup
            documents={group.documents}
            key={group.key}
            label={group.label}
            onRename={openRename}
            onSelectDocument={onSelectDocument}
            resolveDocument={resolveDocument}
          />
        ))}

      <div className="home-actions">
        <button className="home-action" onClick={onCreateDocument} type="button">
          <IconPlus aria-hidden="true" size={16} />
          <span>New document</span>
        </button>
        <button
          className="home-action"
          onClick={() => uploadInputRef.current?.click()}
          type="button"
        >
          <IconUpload aria-hidden="true" size={16} />
          <span>Upload document</span>
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
      {renameDialog}
    </section>
  );
}
