import type { ReactNode } from 'react';
import { Breadcrumbs } from '@mantine/core';
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
    <Breadcrumbs className={styles.breadcrumbs} data-zoom-breadcrumbs>
      {onSelectHome ? (
        <button
          type="button"
          className={styles.crumbButton}
          data-zoom-crumb="home"
          onClick={onSelectHome}
        >
          Home
        </button>
      ) : null}
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
      {path.slice(0, -1).map((item) => (
        <button
          key={item.noteId}
          type="button"
          className={styles.crumbButton}
          data-zoom-crumb="ancestor"
          onClick={() => onSelectNoteId(item.noteId)}
        >
          {formatNavigationLabel(item.label)}
        </button>
      ))}
    </Breadcrumbs>
  );
}
