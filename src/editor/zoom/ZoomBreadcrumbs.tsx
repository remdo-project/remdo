import { Breadcrumbs } from '@mantine/core';
import styles from './ZoomBreadcrumbs.module.css';
import type { NotePathItem } from '@/editor/outline/note-traversal';

interface ZoomBreadcrumbsProps {
  docLabel: string;
  path: NotePathItem[];
  onSelectNoteId: (noteId: string | null) => void;
}

export function ZoomBreadcrumbs({ docLabel, path, onSelectNoteId }: ZoomBreadcrumbsProps) {
  return (
    <Breadcrumbs className={styles.breadcrumbs} data-zoom-breadcrumbs>
      <button
        type="button"
        className={styles.crumbButton}
        data-zoom-crumb="document"
        onClick={() => onSelectNoteId(null)}
      >
        {docLabel}
      </button>
      {path.map((item, index) => {
        const isCurrent = index === path.length - 1;
        if (isCurrent) {
          return (
            <span key={item.noteId} className={styles.crumbCurrent} data-zoom-crumb="current">
              {item.label}
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
            {item.label}
          </button>
        );
      })}
    </Breadcrumbs>
  );
}
