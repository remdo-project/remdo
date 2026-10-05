import type { ReactNode } from 'react';
import { ZoomBreadcrumbs } from '#client/editor/view/workspace';
import type { NotePathItem } from '#client/editor/view/workspace';

export default function DocumentToolbar({
  documentLabel,
  onSelectHome,
  onSelectNoteId,
  onStatusHostChange,
  keyboardReference,
  path,
  searchControl,
}: {
  documentLabel: string;
  keyboardReference?: ReactNode;
  onSelectHome: () => void;
  onSelectNoteId: (noteId: string | null) => void;
  onStatusHostChange: (host: HTMLDivElement | null) => void;
  path: NotePathItem[];
  searchControl: ReactNode;
}) {
  return (
    <header className="document-header">
      <div className="document-header-breadcrumbs">
        <ZoomBreadcrumbs
          docLabel={documentLabel}
          path={path}
          onSelectHome={onSelectHome}
          onSelectNoteId={onSelectNoteId}
        />
      </div>
      <div className="document-header-actions">
        {searchControl}
        <div className="document-header-status" ref={onStatusHostChange} />
        {keyboardReference}
      </div>
    </header>
  );
}
