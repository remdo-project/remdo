import { Breadcrumbs } from '@mantine/core';
import styles from './ZoomBreadcrumbs.module.css';
import type { NotePathItem } from '@/editor/outline/note-traversal';

interface ZoomBreadcrumbsProps {
  docLabel: string;
  path: NotePathItem[];
  onSelectNoteId: (noteId: string | null) => void;
}

const MAX_LABEL_LENGTH = 20;

const truncateLabel = (label: string) => {
  if (label.length <= MAX_LABEL_LENGTH) {
    return label;
  }
  return `${label.slice(0, MAX_LABEL_LENGTH)}...`;
};

export function ZoomBreadcrumbs({ docLabel, path, onSelectNoteId }: ZoomBreadcrumbsProps) {
  const docLabelDisplay = truncateLabel(docLabel);

  return (
    <Breadcrumbs className={styles.breadcrumbs} data-zoom-breadcrumbs>
      <button
        type="button"
        className={styles.crumbButton}
        data-zoom-crumb="document"
        onClick={() => onSelectNoteId(null)}
      >
        {docLabelDisplay}
      </button>
      {path.map((item, index) => {
        const isCurrent = index === path.length - 1;
        const label = truncateLabel(item.label);
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
