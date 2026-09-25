import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect } from 'react';
import { Header, Menu, MenuItem, MenuSection } from 'react-aria-components';
import { IneligibleOperationError } from '#note-sdk';
import type { DocumentSession, NoteListType, OpenDocumentNote } from '#note-sdk';
import { useZoomNoteId } from '#client/editor/view/EditorViewProvider';
import { useNoteMenuState } from './useNoteMenuState';
import { handleNoteMenuShortcut } from './note-menu-shortcuts';

const listTypeOptions = [
  { type: 'number' as const, label: 'Numbered list', id: 'list-number' },
  { type: 'check' as const, label: 'Checklist', id: 'list-check' },
  { type: 'bullet' as const, label: 'Bulleted list', id: 'list-bullet' },
];

const renderShortcutLabel = (label: string, shortcut: string) => {
  const lowerLabel = label.toLowerCase();
  const lowerShortcut = shortcut.toLowerCase();
  const index = lowerLabel.indexOf(lowerShortcut);
  if (index === -1) {
    return label;
  }
  return (
    <span className="note-menu-label">
      {label.slice(0, index)}
      <span className="note-menu-shortcut">{label.slice(index, index + 1)}</span>
      {label.slice(index + 1)}
    </span>
  );
};

interface NoteMenuProps {
  note: OpenDocumentNote;
  view: DocumentSession['view'];
  selection: DocumentSession['selection'];
  editorRoot: HTMLElement | null;
  closeMenu: () => void;
  focusRoot: () => void;
}

export function NoteMenu({ note, view, selection, editorRoot, closeMenu, focusRoot }: NoteMenuProps) {
  const state = useNoteMenuState(note);
  const zoomNoteId = useZoomNoteId();
  // Folding does not offer the zoom root, whose children stay visible anyway.
  const canToggleFold = state !== null && state.canToggleFold && note.getId() !== zoomNoteId;

  const runAction = (operation: () => void | Promise<void>) => {
    focusRoot();
    // A collaborator may change the note after the menu opened; that race is not a failure.
    void Promise.resolve(operation()).catch((error: unknown) => {
      if (!(error instanceof IneligibleOperationError)) throw error;
    });
    closeMenu();
  };
  const triggerFoldToggle = () => runAction(note.toggleFold);
  // eslint-disable-next-line no-restricted-syntax -- SDK selection operation, not Lexical's node toggle.
  const triggerToggleChecked = () => runAction(() => selection.toggleChecked({ noteId: note.getId() }));
  const triggerZoom = () => runAction(note.zoom);
  const triggerZoomOut = () => runAction(view.zoomOut);
  const triggerFoldViewToLevel = (level: number) => runAction(() => view.foldToLevel(level));
  const convertChildList = (listType: NoteListType) => runAction(() => note.setChildListType(listType));
  const actions = {
    foldViewToLevel: triggerFoldViewToLevel,
    toggleFold: canToggleFold ? triggerFoldToggle : undefined,
    zoom: triggerZoom,
    zoomOut: triggerZoomOut,
  };

  useEffect(() => {
    if (!state) closeMenu();
  }, [closeMenu, state]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement;
      if (active instanceof Node && editorRoot?.contains(active)) {
        handleNoteMenuShortcut(event, actions);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (handleNoteMenuShortcut(event.nativeEvent, actions)) return;
    if (event.key !== 'Tab' && event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    closeMenu();
    focusRoot();
  };

  if (!state) return null;
  const foldLabel = state.folded ? 'Unfold' : 'Fold';
  const listActions = state.canSetChildListType
    ? listTypeOptions.filter((option) => option.type !== state.childListType)
    : [];

  return (
    <div onKeyDown={handleMenuKeyDown}>
      <Menu
        aria-label="Quick action menu"
        autoFocus
        className="note-menu-dropdown remdo-menu"
        data-note-menu
        data-note-menu-note-id={note.getId()}
      >
        <MenuSection>
          <Header data-note-menu-section="note">Note</Header>
          <MenuItem data-note-menu-item="toggle-checked" id="toggle-checked" onAction={triggerToggleChecked}>
            Toggle checked
          </MenuItem>
          {canToggleFold
            ? (
                <MenuItem data-note-menu-item="fold" id="fold" onAction={triggerFoldToggle}>
                  {renderShortcutLabel(foldLabel, 'F')}
                </MenuItem>
              )
            : null}
          <MenuItem data-note-menu-item="zoom" id="zoom" onAction={triggerZoom}>
            {renderShortcutLabel('Zoom', 'Z')}
          </MenuItem>
        </MenuSection>
        {listActions.length > 0
          ? (
              <MenuSection>
                <Header data-note-menu-section="children">Children</Header>
                {listActions.map((option) => (
                  <MenuItem
                    data-note-menu-item={option.id}
                    id={option.id}
                    key={option.type}
                    onAction={() => {
                      convertChildList(option.type);
                    }}
                  >
                    {option.label}
                  </MenuItem>
                ))}
              </MenuSection>
            )
          : null}
        <MenuSection>
          <Header data-note-menu-section="view">View</Header>
          <MenuItem data-note-menu-item="zoom-out" id="zoom-out" onAction={triggerZoomOut}>
            <span>Zoom {renderShortcutLabel('out', 'O')}</span>
          </MenuItem>
          <MenuItem data-note-menu-item="view-fold-to-level" id="view-fold-to-level" onAction={() => triggerFoldViewToLevel(1)}>
            <span>
              Fold to level [
              <span className="note-menu-shortcut">0-9</span>
              ]
            </span>
          </MenuItem>
        </MenuSection>
      </Menu>
    </div>
  );
}
