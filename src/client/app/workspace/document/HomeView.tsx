import { IconPlus, IconUpload } from '@tabler/icons-react';
import type { ChangeEvent } from 'react';
import { useEffect, useRef } from 'react';
import { useNoteMenuTarget } from '#client/ui/note-menu-target';
import { formatNavigationLabel } from '#client/ui/navigation-label';
import type { HomeContent, HomeDocumentEntry } from './home-content';
import { DocumentMenu, useDocumentRename } from './DocumentMenu';

export interface HomeViewProps extends HomeContent {
  onSelectDocument: (docId: string) => void;
  onCreateDocument: () => void;
  onUploadDocument: (file: File) => void;
}

function DocumentGroup({
  label,
  documents,
  onSelectDocument,
  onRename,
}: {
  label: string;
  documents: readonly HomeDocumentEntry[];
  onSelectDocument: (docId: string) => void;
  onRename: ReturnType<typeof useDocumentRename>['openRename'];
}) {
  return (
    <section aria-label={label} className="home-group" role="group">
      <h2 className="home-group-label">{label}</h2>
      <ul className="home-doc-list">
        {documents.map((document) => (
          <li className="home-doc-row note-menu-target note-menu-row" key={document.id}>
            <DocumentMenu note={document.note} onRename={onRename} />
            <button
              className="home-doc remdo-interaction-surface"
              data-home-document-ref={document.id}
              onClick={() => onSelectDocument(document.id)}
              type="button"
            >
              {formatNavigationLabel(document.label)}
            </button>
          </li>
        ))}
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
  sources,
  tags,
}: HomeViewProps) {
  const scopeRef = useRef<HTMLElement | null>(null);
  useNoteMenuTarget(scopeRef);
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
    <section ref={scopeRef} aria-label="Home" className="document-home" data-testid="document-home">
      <h1 className="document-home-title" ref={headingRef} tabIndex={-1}>Home</h1>

      {groups
        .filter((group) => group.documents.length > 0)
        .map((group) => (
          <DocumentGroup
            documents={group.documents}
            key={group.key}
            label={group.label}
            onSelectDocument={onSelectDocument}
            onRename={openRename}
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
