import type { DocumentSession } from '#note-sdk';

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
  session: Pick<DocumentSession, 'focus' | 'selection' | 'history'>,
  id: MobileActionId,
  openNoteMenu: () => void,
): void {
  switch (id) {
    case 'indent':
      session.selection.indent();
      return;
    case 'outdent':
      session.selection.outdent();
      return;
    case 'moveUp':
      session.selection.moveUp();
      return;
    case 'moveDown':
      session.selection.moveDown();
      return;
    case 'done':
      // This is the SDK's semantic operation, not Lexical ListItemNode.toggleChecked().
      // eslint-disable-next-line no-restricted-syntax
      session.selection.toggleChecked();
      return;
    case 'fold':
      session.focus.toggleFold();
      return;
    case 'delete':
      session.selection.delete();
      return;
    case 'undo':
      session.history.undo();
      return;
    case 'redo':
      session.history.redo();
      return;
    case 'menu':
      openNoteMenu();
  }
}
