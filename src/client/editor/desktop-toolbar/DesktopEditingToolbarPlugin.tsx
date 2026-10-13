import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { IconArrowBackUp, IconArrowDown, IconArrowForwardUp, IconArrowUp, IconCheck, IconIndentDecrease, IconIndentIncrease } from '@tabler/icons-react';
import { IS_APPLE } from 'lexical';
import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { FocusScope, useFocusManager } from 'react-aria';
import { Button, Toolbar } from 'react-aria-components';
import type { OpenDocument } from '#note-sdk';
import { ActionTooltip } from '#client/ui/ActionTooltip';
import { useCoarsePointer } from '#client/browser/useCoarsePointer';
import { TOGGLE_INLINE_FORMAT_COMMAND } from '#client/editor/foundation/commands';
import { hasNativeEditorSelection } from '#client/editor/foundation/editor-focus';
import { InlineFormatButtons } from '#client/editor/features/inline-formatting/InlineFormatButtons';
import { useInlineFormattingState } from '#client/editor/features/inline-formatting/useInlineFormattingState';
import type { InlineFormat } from '#client/editor/features/inline-formatting/selection';
import { noteChordsForPlatform } from '#client/editor/keymap/chords';
import type { KeyChord } from '#client/editor/keymap/chords';
import './desktop-editing-toolbar.css';

function shortcut(chord: KeyChord) {
  return [chord.ctrl && 'Control', chord.meta && 'Meta', chord.alt && 'Alt', chord.shift && 'Shift', chord.key]
    .filter(Boolean).join('+');
}

function ActionButton({ label, keys, disabled = false, onPress, children }: {
  label: string;
  keys: string;
  disabled?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const hint = keys.replace('Meta', '⌘').replace('Control', 'Ctrl').replace('ArrowUp', '↑').replace('ArrowDown', '↓');
  return (
    <ActionTooltip label={`${label} (${hint})`}>
      <Button
        ref={button => { button?.setAttribute('aria-keyshortcuts', keys); }}
        className="desktop-editing-toolbar__button"
        aria-label={label}
        isDisabled={disabled}
        preventFocusOnPress
        onPress={onPress}
      >
        <span>{children}</span>
      </Button>
    </ActionTooltip>
  );
}

export function DesktopEditingToolbarPlugin({ openDocument }: { openDocument: OpenDocument }) {
  const coarse = useCoarsePointer();
  return coarse ? null : <FocusScope><DesktopEditingToolbar openDocument={openDocument} /></FocusScope>;
}

function DesktopEditingToolbar({ openDocument }: { openDocument: OpenDocument }) {
  const [editor] = useLexicalComposerContext();
  const focusManager = useFocusManager()!;
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const activationRef = useRef<string | null>(null);
  const isActive = useCallback(() => {
    const root = editor.getRootElement();
    if (!root || !toolbarRef.current) return false;
    const doc = root.ownerDocument;
    return hasNativeEditorSelection(root) || (doc.hasFocus() && toolbarRef.current.contains(doc.activeElement));
  }, [editor]);
  const { editable, target } = useInlineFormattingState(editor, isActive);
  const canUndo = useSyncExternalStore(openDocument.subscribeCapabilities, openDocument.history.canUndo, openDocument.history.canUndo);
  const canRedo = useSyncExternalStore(openDocument.subscribeCapabilities, openDocument.history.canRedo, openDocument.history.canRedo);
  const mod = IS_APPLE ? 'Meta' : 'Control';
  const chords = noteChordsForPlatform(IS_APPLE);
  const run = (operation: () => void) => () => {
    operation();
    editor.focus();
  };
  const format = (format: InlineFormat) => {
    const fingerprint = activationRef.current;
    activationRef.current = null;
    if (fingerprint && editor.dispatchCommand(TOGGLE_INLINE_FORMAT_COMMAND, { format, fingerprint })) editor.focus();
  };

  return (
    <div onKeyDownCapture={event => {
      if (event.key !== 'Home' && event.key !== 'End') return;
      if (event.key === 'Home') focusManager.focusFirst();
      else focusManager.focusLast();
      event.preventDefault();
      event.stopPropagation();
    }}>
      <Toolbar
        ref={toolbarRef}
        aria-label="Document editing"
        className="desktop-editing-toolbar"
        onMouseDownCapture={event => event.preventDefault()}
      >
        <div role="group" aria-label="History" className="desktop-editing-toolbar__group">
          <ActionButton label="Undo" keys={`${mod}+Z`} disabled={!editable || !canUndo} onPress={run(openDocument.history.undo)}>
            <IconArrowBackUp size={18} aria-hidden="true" />
          </ActionButton>
          <ActionButton label="Redo" keys={`${mod}+Shift+Z`} disabled={!editable || !canRedo} onPress={run(openDocument.history.redo)}>
            <IconArrowForwardUp size={18} aria-hidden="true" />
          </ActionButton>
        </div>
        <span className="desktop-editing-toolbar__divider" aria-hidden="true" />
        <div role="group" aria-label="Formatting" className="desktop-editing-toolbar__group">
          <InlineFormatButtons
            className="desktop-editing-toolbar__button"
            states={target?.states ?? null}
            mac={IS_APPLE}
            onFormatStart={() => { activationRef.current = target?.fingerprint ?? null; }}
            onFormat={format}
          />
        </div>
        <span className="desktop-editing-toolbar__divider" aria-hidden="true" />
        <div role="group" aria-label="Indentation" className="desktop-editing-toolbar__group">
          <ActionButton label="Outdent" keys="Shift+Tab" disabled={!editable} onPress={run(openDocument.selection.outdent)}>
            <IconIndentDecrease size={18} aria-hidden="true" />
          </ActionButton>
          <ActionButton label="Indent" keys="Tab" disabled={!editable} onPress={run(openDocument.selection.indent)}>
            <IconIndentIncrease size={18} aria-hidden="true" />
          </ActionButton>
        </div>
        <span className="desktop-editing-toolbar__divider" aria-hidden="true" />
        <div role="group" aria-label="Movement" className="desktop-editing-toolbar__group">
          <ActionButton label="Move up" keys={shortcut(chords.moveUp)} disabled={!editable} onPress={run(openDocument.selection.moveUp)}>
            <IconArrowUp size={18} aria-hidden="true" />
          </ActionButton>
          <ActionButton label="Move down" keys={shortcut(chords.moveDown)} disabled={!editable} onPress={run(openDocument.selection.moveDown)}>
            <IconArrowDown size={18} aria-hidden="true" />
          </ActionButton>
        </div>
        <span className="desktop-editing-toolbar__divider" aria-hidden="true" />
        <ActionButton label="Toggle checked" keys={shortcut(chords.toggleChecked)} disabled={!editable} onPress={run(openDocument.selection.toggleChecked)}>
          <IconCheck size={18} aria-hidden="true" />
        </ActionButton>
      </Toolbar>
    </div>
  );
}
