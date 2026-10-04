import { useEffect } from 'react';

export const FOCUS_DOCUMENT_SEARCH_STATE = { focusDocumentSearch: true } as const;

export function isFocusDocumentSearchState(state: unknown): boolean {
  return typeof state === 'object' && state !== null
    && (state as { focusDocumentSearch?: unknown }).focusDocumentSearch === true;
}

// Modal only: the keyboard reference is a non-modal dialog, and the shortcut
// stays available while it is open.
const MODAL_SELECTOR = '.remdo-modal-overlay, [aria-modal="true"]';

export function useDocumentSearchShortcut(onTrigger: () => void) {
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.shiftKey || (!event.metaKey && !event.ctrlKey)) {
        return;
      }
      if (event.code !== 'KeyK' && event.key.toLowerCase() !== 'k') {
        return;
      }
      if (document.querySelector(MODAL_SELECTOR)) {
        return;
      }

      event.preventDefault();
      onTrigger();
    };

    document.addEventListener('keydown', handleShortcut);
    return () => {
      document.removeEventListener('keydown', handleShortcut);
    };
  }, [onTrigger]);
}
