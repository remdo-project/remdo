import type { ReactNode } from 'react';
import styles from './ZoomBreadcrumbs.module.css';
import type { NotePathItem } from '#client/editor/outline/note-traversal';
import { formatNavigationLabel } from '#client/ui/navigation-label';

interface ZoomBreadcrumbsProps {
  docLabel: string;
  documentControl?: ReactNode;
  path: NotePathItem[];
  onSelectHome?: () => void;
  onSelectNoteId: (noteId: string | null) => void;
}

export function ZoomBreadcrumbs({ docLabel, documentControl, path, onSelectHome, onSelectNoteId }: ZoomBreadcrumbsProps) {
  const docLabelDisplay = formatNavigationLabel(docLabel);
  const documentCrumb = (
    <button
      type="button"
      className={styles.crumbButton}
      data-zoom-crumb="document"
      onClick={() => onSelectNoteId(null)}
    >
      {docLabelDisplay}
    </button>
  );

  return (
    <nav aria-label="Breadcrumb" className={styles.breadcrumbs} data-zoom-breadcrumbs>
      <ol className={styles.list}>
        {onSelectHome ? (
          <li>
            <button
              type="button"
              className={styles.crumbButton}
              data-zoom-crumb="home"
              onClick={onSelectHome}
            >
              Home
            </button>
          </li>
        ) : null}
        <li>
          {documentControl ? (
            <span className={styles.documentCrumbGroup} data-zoom-crumb="document-group">
              {documentCrumb}
              <span className={styles.documentControl} data-zoom-crumb="document-control">
                {documentControl}
              </span>
            </span>
          ) : (
            documentCrumb
          )}
        </li>
        {path.slice(0, -1).map((item) => (
          <li key={item.noteId}>
            <button
              type="button"
              className={styles.crumbButton}
              data-zoom-crumb="ancestor"
              onClick={() => onSelectNoteId(item.noteId)}
            >
              {formatNavigationLabel(item.label)}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
