import type { OpenDocument } from '#note-sdk';

// The toolbar's inventory and display order are surface concerns
// (docs/specs/outliner/mobile-toolbar.md). Execution delegates to named SDK
// operations; opening the menu remains a host/surface binding.
export type MobileActionId =
  | 'indent'
  | 'outdent'
  | 'moveUp'
  | 'moveDown'
  | 'done'
  | 'fold'
  | 'delete'
  | 'undo'
  | 'redo'
  | 'menu';

export function runMobileAction(
  openDocument: Pick<OpenDocument, 'focus' | 'selection' | 'history'>,
  id: MobileActionId,
  openNoteMenu: () => void,
): void {
  switch (id) {
    case 'indent':
      openDocument.selection.indent();
      return;
    case 'outdent':
      openDocument.selection.outdent();
      return;
    case 'moveUp':
      openDocument.selection.moveUp();
      return;
    case 'moveDown':
      openDocument.selection.moveDown();
      return;
    case 'done':
      // This is the SDK's semantic operation, not Lexical ListItemNode.toggleChecked().
      // eslint-disable-next-line no-restricted-syntax
      openDocument.selection.toggleChecked();
      return;
    case 'fold':
      openDocument.focus.toggleFold();
      return;
    case 'delete':
      openDocument.selection.delete();
      return;
    case 'undo':
      openDocument.history.undo();
      return;
    case 'redo':
      openDocument.history.redo();
      return;
    case 'menu':
      openNoteMenu();
  }
}
