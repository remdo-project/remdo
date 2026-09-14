import { describe, expect, it, vi } from 'vitest';
import { runMobileAction } from './actions';

function createSession() {
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
  const session = {
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
  return { operations, session };
}

describe('mobile toolbar action delegation', () => {
  it('maps the toolbar inventory to named SDK operations', () => {
    const { operations, session } = createSession();
    const openNoteMenu = vi.fn();

    runMobileAction(session, 'indent', openNoteMenu);
    runMobileAction(session, 'outdent', openNoteMenu);
    runMobileAction(session, 'moveUp', openNoteMenu);
    runMobileAction(session, 'moveDown', openNoteMenu);
    runMobileAction(session, 'done', openNoteMenu);
    runMobileAction(session, 'fold', openNoteMenu);
    runMobileAction(session, 'delete', openNoteMenu);
    runMobileAction(session, 'undo', openNoteMenu);
    runMobileAction(session, 'redo', openNoteMenu);
    runMobileAction(session, 'menu', openNoteMenu);

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
