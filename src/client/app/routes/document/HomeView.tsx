import { IconPlus, IconUpload } from '@tabler/icons-react';
import type { ChangeEvent } from 'react';
import { useRef } from 'react';
import { formatNavigationLabel } from '#client/ui/navigation-label';
import type { HomeContent, HomeDocumentEntry } from './home-content';

export interface HomeViewProps extends HomeContent {
  onSelectDocument: (docId: string) => void;
  onCreateDocument: () => void;
  onUploadDocument: (file: File) => void;
}

function DocumentGroup({
  label,
  documents,
  onSelectDocument,
}: {
  label: string;
  documents: readonly HomeDocumentEntry[];
  onSelectDocument: (docId: string) => void;
}) {
  return (
    <section aria-label={label} className="home-group" role="group">
      <h2 className="home-group-label">{label}</h2>
      <ul className="home-doc-list">
        {documents.map((document) => (
          <li key={document.id}>
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
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const handleUploadInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = '';
    if (file) {
      onUploadDocument(file);
    }
  };

  const entryGroups: Array<{ label: string; entries: readonly HomeDocumentEntry[] }> = [
    { label: 'Favorites', entries: favorites },
    { label: 'Tags', entries: tags },
    { label: 'Recents', entries: recents },
  ];

  return (
    <section aria-label="Home" className="document-home" data-testid="document-home">
      <h1 className="document-home-title">Home</h1>

      {entryGroups
        .filter((group) => group.entries.length > 0)
        .map((group) => (
          <DocumentGroup
            documents={group.entries}
            key={group.label}
            label={group.label}
            onSelectDocument={onSelectDocument}
          />
        ))}

      {sources
        .filter((source) => source.documents.length > 0)
        .map((source) => (
          <DocumentGroup
            documents={source.documents}
            key={source.id}
            label={source.label}
            onSelectDocument={onSelectDocument}
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
    </section>
  );
}
