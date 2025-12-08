import type { LexicalEditor } from 'lexical';
import { act } from '@testing-library/react';
import { CONTROLLED_TEXT_INSERTION_COMMAND } from 'lexical';
import type { RemdoTestApi } from '@/editor/plugins/dev';

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

export async function pressKey(
  remdo: RemdoTestApi,
  { key, shift = false, alt = false, meta = false, ctrl = false, ctrlOrMeta }: PressKeyOptions
) {
  const root = remdo.editor.getRootElement();
  if (!root) {
    throw new Error('Lexical root element is not mounted');
  }

  let nextMeta = meta;
  let nextCtrl = ctrl;

  if (typeof ctrlOrMeta === 'boolean') {
    if (ctrlOrMeta) {
      nextMeta = IS_APPLE;
      nextCtrl = !IS_APPLE;
    } else {
      nextMeta = false;
      nextCtrl = false;
    }
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
    const allowed = root.dispatchEvent(event);
    if (allowed && isPrintableKey(key) && !alt && !nextMeta && !nextCtrl) {
      remdo.editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, key);
      return;
    }
    if (allowed && key.length === 1 && !alt && !nextMeta && !nextCtrl) {
      dispatchInputEvents(root, key);
    }
  });

  await waitForEditorUpdate(remdo.editor);
  await remdo.waitForSynced();
}

function isPrintableKey(key: string): boolean {
  return key.length === 1 && key >= ' ' && key !== '\u007F';
}

function waitForEditorUpdate(editor: LexicalEditor) {
  return new Promise<void>((resolve) => {
    editor.update(() => {
      resolve();
    });
  });
}

function dispatchInputEvents(root: HTMLElement, text: string) {
  const beforeInput = new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data: text,
  });

  const allowed = root.dispatchEvent(beforeInput);
  if (!allowed) {
    return;
  }

  const input = new InputEvent('input', {
    bubbles: true,
    cancelable: false,
    inputType: 'insertText',
    data: text,
  });
  root.dispatchEvent(input);
}
