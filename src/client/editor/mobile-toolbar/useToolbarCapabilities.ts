import { useMemo, useSyncExternalStore } from 'react';
import type { OpenDocument } from '#note-sdk';

export interface ToolbarCapabilities {
  canToggleFold: boolean;
  canDelete: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

const UNAVAILABLE: ToolbarCapabilities = {
  canToggleFold: false,
  canDelete: false,
  canUndo: false,
  canRedo: false,
};

/** React snapshot identity stays in the toolbar binding, outside the SDK. */
export function useToolbarCapabilities(
  openDocument: Pick<OpenDocument, 'subscribeCapabilities' | 'focus' | 'selection' | 'history'>,
): ToolbarCapabilities {
  const getSnapshot = useMemo(() => {
    let current = UNAVAILABLE;
    return () => {
      try {
        const next = {
          canToggleFold: openDocument.focus.canToggleFold(),
          canDelete: openDocument.selection.canDelete(),
          canUndo: openDocument.history.canUndo(),
          canRedo: openDocument.history.canRedo(),
        };
        if (current.canToggleFold !== next.canToggleFold || current.canDelete !== next.canDelete
          || current.canUndo !== next.canUndo || current.canRedo !== next.canRedo) {
          current = next;
        }
      } catch {
        // Keep conditional actions disabled after an unexpected failure until a later read recovers.
        current = UNAVAILABLE;
      }
      return current;
    };
  }, [openDocument]);
  return useSyncExternalStore(openDocument.subscribeCapabilities, getSnapshot, getSnapshot);
}
