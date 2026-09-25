import { describe, expect, it, vi } from 'vitest';
import { runMobileAction } from './actions';

function createOpenDocument() {
  const operations = {
    indent: vi.fn(),
    outdent: vi.fn(),
    moveUp: vi.fn(),
    moveDown: vi.fn(),
    toggleChecked: vi.fn(),
    toggleFocusedFold: vi.fn(),
    delete: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
  };
  const openDocument = {
    focus: { canToggleFold: () => false, toggleFold: operations.toggleFocusedFold },
    selection: {
      canDelete: () => false,
      indent: operations.indent,
      outdent: operations.outdent,
      moveUp: operations.moveUp,
      moveDown: operations.moveDown,
      toggleChecked: operations.toggleChecked,
      delete: operations.delete,
    },
    history: { canUndo: () => false, canRedo: () => false, undo: operations.undo, redo: operations.redo },
  };
  return { operations, openDocument };
}

describe('mobile toolbar action delegation', () => {
  it('maps the toolbar inventory to named SDK operations', () => {
    const { operations, openDocument } = createOpenDocument();
    const openNoteMenu = vi.fn();

    runMobileAction(openDocument, 'indent', openNoteMenu);
    runMobileAction(openDocument, 'outdent', openNoteMenu);
    runMobileAction(openDocument, 'moveUp', openNoteMenu);
    runMobileAction(openDocument, 'moveDown', openNoteMenu);
    runMobileAction(openDocument, 'done', openNoteMenu);
    runMobileAction(openDocument, 'fold', openNoteMenu);
    runMobileAction(openDocument, 'delete', openNoteMenu);
    runMobileAction(openDocument, 'undo', openNoteMenu);
    runMobileAction(openDocument, 'redo', openNoteMenu);
    runMobileAction(openDocument, 'menu', openNoteMenu);

    expect(operations.indent).toHaveBeenCalledOnce();
    expect(operations.outdent).toHaveBeenCalledOnce();
    expect(operations.moveUp).toHaveBeenCalledOnce();
    expect(operations.moveDown).toHaveBeenCalledOnce();
    expect(operations.toggleChecked).toHaveBeenCalledOnce();
    expect(operations.toggleFocusedFold).toHaveBeenCalledOnce();
    expect(operations.delete).toHaveBeenCalledOnce();
    expect(operations.undo).toHaveBeenCalledOnce();
    expect(operations.redo).toHaveBeenCalledOnce();
    expect(openNoteMenu).toHaveBeenCalledOnce();
  });
});
