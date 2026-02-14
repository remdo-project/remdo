import type { LexicalEditor } from 'lexical';
import { act } from '@testing-library/react';
import { CONTROLLED_TEXT_INSERTION_COMMAND } from 'lexical';
import type { RemdoTestApi } from '@/editor/plugins/dev';
import { getRootElementOrThrow } from './selection';

interface NavigatorWithUAData extends Navigator {
  userAgentData?: { platform?: string };
}

const APPLE_PATTERN = /Mac(?:intosh)?|iPhone|iPad|iPod/i;
const navigatorRef =
  typeof navigator === 'undefined' ? null : (navigator as NavigatorWithUAData);
const platformSource = navigatorRef?.userAgentData?.platform ?? navigatorRef?.userAgent ?? '';
const IS_APPLE = APPLE_PATTERN.test(platformSource);

interface PressKeyOptions {
  key: string;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  ctrl?: boolean;
  ctrlOrMeta?: boolean;
}

const NON_TEXT_KEYS = new Set([
  'Backspace',
  'Delete',
  'Enter',
  'Tab',
  'Escape',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

function normalizeCtrlMeta(meta: boolean, ctrl: boolean, ctrlOrMeta?: boolean): { meta: boolean; ctrl: boolean } {
  if (typeof ctrlOrMeta === 'boolean') {
    if (ctrlOrMeta) {
      return { meta: IS_APPLE, ctrl: !IS_APPLE };
    }
    return { meta: false, ctrl: false };
  }
  return { meta, ctrl };
}

/**
 * Dispatches a non-text key (arrows, Backspace/Delete, Enter, Tab, etc.).
 * Printable keys without modifiers are rejected; use {@link typeText} instead.
 */
export async function pressKey(
  remdo: RemdoTestApi,
  { key, shift = false, alt = false, meta = false, ctrl = false, ctrlOrMeta }: PressKeyOptions
): Promise<void> {
  const root = remdo.editor.getRootElement()!;

  const { meta: nextMeta, ctrl: nextCtrl } = normalizeCtrlMeta(meta, ctrl, ctrlOrMeta);

  const isPlainPrintable = key.length === 1 && !alt && !nextMeta && !nextCtrl && !shift;
  if (isPlainPrintable) {
    throw new Error('pressKey handles non-text keys only; use typeText for character input');
  }

  const isPrintableChord = key.length === 1 && (nextMeta || nextCtrl || alt);
  const isSupportedNonText = NON_TEXT_KEYS.has(key);
  if (!isPrintableChord && !isSupportedNonText) {
    throw new Error(`pressKey does not support key "${key}" with the given modifiers`);
  }

  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    shiftKey: shift,
    altKey: alt,
    metaKey: nextMeta,
    ctrlKey: nextCtrl,
  });

  await act(async () => {
    root.dispatchEvent(event);
  });

  await waitForEditorUpdate(remdo.editor);
  await remdo.waitForSynced();
}

/**
 * Inserts plain text characters using Lexical's controlled insertion path.
 * If the keydown is prevented by the editor (e.g., structural mode), no text is inserted.
 * For deterministic model-only edits, prefer {@link appendTextToNote} in note helpers.
 */
export async function typeText(remdo: RemdoTestApi, text: string): Promise<void> {
  const root = getRootElementOrThrow(remdo.editor);

  await act(async () => {
    for (const ch of text) {
      const event = new KeyboardEvent('keydown', {
        key: ch,
        bubbles: true,
        cancelable: true,
      });

      const allowed = root.dispatchEvent(event);
      if (!allowed) {
        continue; // respect prevention (e.g., structural selection)
      }

      remdo.editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, ch);
      dispatchInputEvents(root, ch);
    }
  });

  await waitForEditorUpdate(remdo.editor);
  await remdo.waitForSynced();
}

function waitForEditorUpdate(editor: LexicalEditor) {
  return new Promise<void>((resolve) => {
    editor.update(() => {
      resolve();
    });
  });
}

function dispatchInputEvents(root: HTMLElement, text: string, inputType: string = 'insertText') {
  const beforeInput = new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    inputType,
    data: text.length > 0 ? text : null,
  });

  const allowed = root.dispatchEvent(beforeInput);
  if (!allowed) {
    return;
  }

  const input = new InputEvent('input', {
    bubbles: true,
    cancelable: false,
    inputType,
    data: text.length > 0 ? text : null,
  });
  root.dispatchEvent(input);
}
