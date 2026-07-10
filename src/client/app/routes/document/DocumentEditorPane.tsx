import Editor from '#client/editor/Editor';

export default function DocumentEditorPane({
  docId,
  onImportError,
  pending,
  searchModeActive,
  searchModeRequested,
  sourceId,
  sourceOrigin,
  statusHost,
}: {
  docId: string;
  onImportError: (error: Error) => void;
  pending: boolean;
  searchModeActive: boolean;
  searchModeRequested: boolean;
  sourceId: string | null;
  sourceOrigin: string | null;
  statusHost: HTMLDivElement | null;
}) {
  const className = searchModeActive
    ? 'document-editor-pane document-editor-pane--hidden'
    : 'document-editor-pane';

  return (
    <div className={className}>
      {pending ? (
        <section className="document-editor-loading" role="status">
          Loading document
        </section>
      ) : (
        <Editor
          key={`${sourceId ?? 'local'}:${docId}`}
          docId={docId}
          sourceOrigin={sourceOrigin}
          sourceId={sourceId}
          searchModeRequested={searchModeRequested}
          statusPortalRoot={statusHost}
          onPendingDocumentImportError={onImportError}
        />
      )}
    </div>
  );
}
