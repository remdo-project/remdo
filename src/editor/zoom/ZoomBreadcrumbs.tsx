import type { ReactNode } from 'react';
import { Breadcrumbs } from '@mantine/core';
import styles from './ZoomBreadcrumbs.module.css';
import type { NotePathItem } from '@/editor/outline/note-traversal';
import { formatNavigationLabel } from '@/ui/navigation-label';

interface ZoomBreadcrumbsProps {
  docLabel: string;
  documentControl?: ReactNode;
  path: NotePathItem[];
  onSelectNoteId: (noteId: string | null) => void;
}

export function ZoomBreadcrumbs({ docLabel, documentControl, path, onSelectNoteId }: ZoomBreadcrumbsProps) {
  const docLabelDisplay = formatNavigationLabel(docLabel);

  return (
    <Breadcrumbs className={styles.breadcrumbs} data-zoom-breadcrumbs>
      {documentControl ? (
        <span className={styles.documentCrumbGroup} data-zoom-crumb="document-group">
          <button
            type="button"
            className={styles.crumbButton}
            data-zoom-crumb="document"
            onClick={() => onSelectNoteId(null)}
          >
            {docLabelDisplay}
          </button>
          <span className={styles.documentControl} data-zoom-crumb="document-control">
            {documentControl}
          </span>
        </span>
      ) : (
        <button
          type="button"
          className={styles.crumbButton}
          data-zoom-crumb="document"
          onClick={() => onSelectNoteId(null)}
        >
          {docLabelDisplay}
        </button>
      )}
      {path.map((item, index) => {
        const isCurrent = index === path.length - 1;
        const label = formatNavigationLabel(item.label);
        if (isCurrent) {
          return (
            <span key={item.noteId} className={styles.crumbCurrent} data-zoom-crumb="current">
              {label}
            </span>
          );
        }

        return (
          <button
            key={item.noteId}
            type="button"
            className={styles.crumbButton}
            data-zoom-crumb="ancestor"
            onClick={() => onSelectNoteId(item.noteId)}
          >
            {label}
          </button>
        );
      })}
    </Breadcrumbs>
  );
}
